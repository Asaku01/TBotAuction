import dotenv from 'dotenv';
dotenv.config();
import { Bot, InlineKeyboard, Keyboard, session } from "grammy";
import { AuctionContext } from './types/AuctionContext';
import { SessionData } from './types/SessionData';
import { newAuctionRouter, goToRouteChannelId } from './routes/insertAuction';
import { bidRouter, goToRouteBidValue, goToRouteBid } from './routes/bid';
import { logger, replyToThread, TimeUtils, updateAuctionMessage, formatAuctionCurrency, composeNotifyList } from './data/Utils';
import { db, QueryResult, SingleQueryResult } from './data/DBUtils';
import { cancelAuctionRouter, goToRouteCancelAuctionSelectChannel } from './routes/cancelAuction';

const TBOT_TOKEN = process.env.TBOT_TOKEN??"";

export const bot = new Bot<AuctionContext>(TBOT_TOKEN);

bot.api.setMyCommands([
    { command: "support", description: "Report issues and get support." },
    { command: "start", description: "Starts the bot" },
    { command: "bid", description: "Bid on one of the open auctions you have registered to. You can shortcut it by typing /bid_[auctionId]" },
    { command: "help", description: "Get some nice tips on how to use the bot." },
    { command: "auction", description: "For admins only - create a new auction in one of your channels." },
    { command: "cancel_auction", description: "For admins only - cancel an auction from one of your channels." }
  ]);

bot.command('support', async ctx=>{
    var kb = new InlineKeyboard();
    kb.url("Click", "https://t.me/bugichannel");
    ctx.reply("Per accedere al gruppo di supporto, premi il pulsante:",{
        reply_markup:kb
    })
});

bot.command('help', async ctx=>{
    ctx.reply(`Welcome to the friendly auction bot, made by yours truly. 
Now, you might be lost about the bot's inner working but that's okay, I'm here so summarize the most important things.

For users:
1. Go to a channel where the bot published an auction.
2. Register yourself through the register button. A private chat with the bot will open and you'll have to press the start button. This process must be repeated for every new auction you intend to participate in.
3. The bot will now start sending you notifications in the private chat regarding the auction. (when it starts, ends, someone outbids you, someone bids, etc);
4. Bid using the command /bid
5. Enjoy

For admins:
1. You have to add the bot to your channel and make it an administrator. 
2. You have to add the bot to the supergroup of the channel and enable full visibility.
3. Proceed to create new auctions through the private chat with the bot.
NOTE: Only the admin that added the bot to the channel may create auctions on that channel.`);
});

bot.use(session({ initial: (): SessionData => ({ step: "idle", insertAuction: {}, cancelAuction: {} }) }));

bot.on(':forward_date', async(ctx)=>{
    logger.info(`FORWARDED MESSAGE FROM CHAT_ID:${ctx.update.message?.forward_from_chat?.id} MESSAGE_ID:${ctx.update.message?.forward_from_message_id} TO CHAT_ID:${ctx.update.message?.chat.id} MESSAGE_ID:${ctx.update.message?.message_id}`);
    logger.info(await db.setAuctionThread(ctx.update.message?.forward_from_chat?.id??0, ctx.update.message?.forward_from_message_id??0, ctx.update.message?.chat.id??0, ctx.update.message?.message_id??0));
});

bot.on('my_chat_member', async(ctx)=>{
    if(!(ctx.chat.type === "channel")) return;
    
    
    if(ctx.myChatMember.new_chat_member.status === "kicked" || ctx.myChatMember.new_chat_member.status === "left"){
        logger.info(`Bot kicked from channel ${ctx.chat.title} by ${ctx.from?.username}`);
        await db.deleteChannel(ctx.chat.id);
    }else{
        logger.info(`Bot added to channel ${ctx.chat.title} by ${ctx.from?.username}`); 
        await db.addChannel(ctx.chat?.id??0, ctx.chat.title, ctx.chat.username??"", ctx.chat.type, ctx.myChatMember?.new_chat_member.status??"", ctx.from?.username??"", ctx.from?.id??0);
    }
});

bot.command('start', async (ctx) =>{
    if(!ctx.match){
        ctx.reply('Welcome! Up and running.');
        return;
    }

    logger.info(`Bot start payload: ${ctx.match}`, {service: "register_user_for_auction"});

    let auctionSequence = ctx.match;
    let auction = (await db.getAuctionBySequence(Number(auctionSequence))).result;

    if(auction?.status === "ENDED"){
        ctx.reply(`Mi dispiace @${ctx.from?.username}(${ctx.from?.first_name}) L'asta a cui stai provando a registrati è terminata`);
    }
    if(auction?.status === "CANCELED"){
        ctx.reply(`Mi dispiace @${ctx.from?.username}(${ctx.from?.first_name}) L'asta a cui stai provando a registrati è stata cancellata.`);
    }

    logger.info(`Request from user ${ctx.from?.first_name}(@${ctx.from?.username}) to be notified about auction "${auction?.title}"(${auction?.channel_sequence})`, {service: "register_user_for_auction"});

    if((await db.checkIfUserIsSubscribed(auction?.channel_sequence, ctx.from?.username??"")).result){
        console.log(auction);
        if(auction?.status === "OPEN"){
            await ctx.reply(`Sei già registrato a questa asta, clicca su uno dei pulsanti sottostanti per fare un'offerta.`);
            ctx.session.B_auction = auction;
            goToRouteBidValue(ctx);
            return;
        }

        logger.info(`Request from user ${ctx.from?.first_name}(@${ctx.from?.username}) to be notified about auction "${auction?.title}"(${auction?.channel_sequence}) denied because already registered`, {service: "register_user_for_auction"});
        ctx.reply(`Sei già registrato a questa asta. Verrai notificato quando potrai fare un'offerta.`);
        return;
    }
    
    await db.insertIntoNotifyList(auction?.channel_sequence, ctx.from?.username??"", ctx.from?.id??0, ctx.from?.first_name??"", ctx.chat.id);
    logger.info(`Request from user ${ctx.from?.first_name}(@${ctx.from?.username}) to be notified about auction "${auction?.title}"(${auction?.channel_sequence}) accepted`, {service: "register_user_for_auction"});

    await updateAuctionMessage(auction);

    if((await db.getNotifyList(auction?.channel_sequence)).results.length === auction?.min_biders){
        logger.info(`Minimum number of participants for auction "${auction.title}"(${auction.channel_sequence}) reached!`, {service: "register_user_for_auction"});
        replyToThread(auction, `Il numero minimo di partecipanti è stato raggiunto, l'asta può iniziare una volta raggiunta la data di partenza.`)
    }

    //ctx.api.forwardMessage(ctx.chat.id, auction?.channel_id, auction?.channel_message_id);
    //ctx.forwardMessage(ctx.chat.id, {forward_message:"forward_message", message_id: 33});
    await ctx.reply(`Ciao amico, ti sei appena registrato con successo all'asta "${auction?.title}"! Eccoti alcune indicazioni per iniziare:
    
ISTRUZIONI:
- L'asta rimarrà in stato "sospesa" finchè non sarà raggiunto il numero minimo di partecipanti.
- Se entro la data di inizio dell'asta, non sarà raggiunto il numero minimo di partecipanti, l'asta si chiuderà in automatico.
- Le puntate sono valide solo dopo che l'asta sarà in stato "aperta".
- Puoi fare la tua offerta utilizzando il seguente comando: "/bid". Questo aprirà un menù che ti permetterà di scegliere l'asta su cui puntare in caso tu ne abbia aperte più di una.
- Se la tua offerta viene superata, riceverai un messaggio di notifica.`);

    if(auction?.status == "OPEN"){
        await ctx.reply("Comunque, l'asta in questione e' gia' aperta, quindi puoi fare un'offerta da subito.");
        ctx.session.B_auction = auction;
        goToRouteBidValue(ctx);
    }

});

bot.command("auction", async(ctx)=>{
    if(ctx.chat.type !== "private") return;
    logger.info(`User @${ctx.from?.username} - ${ctx.from?.first_name} wants to create a new auction.`); 
    goToRouteChannelId(ctx);
});

bot.hears(/^\/bid(_\d+)*$/, async(ctx)=>{
    if(ctx.chat.type !== "private") return;
    logger.info(`User @${ctx.from?.username} - ${ctx.from?.first_name} wants to bid!`); 
    goToRouteBid(ctx);
});

bot.command("cancel_auction", async(ctx)=>{
    if(ctx.chat.type !== "private") return;
    logger.info(`User @${ctx.from?.username} - ${ctx.from?.first_name} wants to cancel an auction!`); 
    goToRouteCancelAuctionSelectChannel(ctx);
});

//listen to bids on the thread
bot.hears(/^(\d+)$/, async(ctx, next)=>{
    let auction =  (await db.getAuctionByThread(ctx.update.message?.reply_to_message?.chat.id??0, ctx.update.message?.reply_to_message?.message_id??0)).result;
    if(!auction){
        next();
        return;
    }
    
    let offer = Number(ctx.msg.text??0);
    
    logger.info(`There was an offer of ${formatAuctionCurrency(ctx.msg.text??"", auction)} from ${ctx.from?.username} - ${ctx.from?.first_name} on auction "${auction.title}"(${auction.channel_sequence}) status: ${auction.status}`);

    if(auction.status !== "OPEN"){
        replyToThread(auction, `Ciao @${ctx.msg.from?.username}(${ctx.msg.from?.first_name}), l'asta deve ancora iniziare, ti sarà inviata una notifica appena sarà in stato "aperta".`);
        logger.info("offer deleted");
        await ctx.deleteMessage();
        return;
    }

    let maxOffer = (await db.getAuctionMaxBid(auction.channel_sequence)).result;
    if(offer < (maxOffer?.offer + auction.min_bid)){
        replyToThread(auction, `@${ctx.msg.from?.username}(${ctx.msg.from?.first_name}), la tua offerta è inferiore al prezzo raggiunto dal prodotto, ti preghiamo di inserire un importo maggiore di quello del prezzo raggiunto (${formatAuctionCurrency(maxOffer?.offer + auction.min_bid, auction)}+), rispettando il valore di puntata minima.`)
        logger.info("offer deleted");
        await ctx.deleteMessage();
        return;
    }

    if(offer < auction.start_price){
        replyToThread(auction, `@${ctx.msg.from?.username}(${ctx.msg.from?.first_name}), la puntata è invalida, poichè inferiore al prezzo di partenza (${formatAuctionCurrency(auction.start_price, auction)}).`);
        logger.info("offer deleted");
        await ctx.deleteMessage();
        return;
    }

    await db.insertBid(auction?.channel_id, auction?.channel_sequence??0, ctx.msg?.from?.id??0, ctx.msg?.from?.username??"", ctx.from?.first_name??"", offer);

    logger.info(`The offer of ${ctx.msg.text} from ${ctx.from?.username} - ${ctx.from?.first_name} on auction "${auction.title}"(${auction.channel_sequence}) was accepted`);

    await updateAuctionMessage(auction);

    replyToThread(auction, `@${maxOffer?.user_name}(${maxOffer?.first_name}), la tua offerta e' stata superata da @${ctx.msg.from?.username}(${ctx.msg.from?.first_name}).`);

    db.getAuctionOtherParticipants(ctx.from?.id??0, auction?.channel_sequence).then(response=>{
        response.results.forEach(async otherParticipant=>{
            await ctx.api.sendMessage(otherParticipant.private_chat_id, `@${ctx.from?.username}(${ctx.from?.first_name}) ha offerto ${formatAuctionCurrency(offer, auction)} per l'asta "${auction?.title}"(${auction?.channel_sequence})!`).catch(error=>{
                logger.error(error);
            });
            const keyboard = new Keyboard().text(`/bid_${auction?.channel_sequence}`);
            if(otherParticipant.user_id == maxOffer?.user_id) await ctx.api.sendMessage(otherParticipant.private_chat_id, `Ciao @${maxOffer?.user_name}(${maxOffer?.first_name})! La tua offerta per l'asta "${auction?.title}"(${auction?.channel_sequence}) è stata superata da @${ctx.from?.username}(${ctx.from?.first_name}), vuoi rilanciare? /bid_${auction?.channel_sequence}`,{
                reply_markup: keyboard
            }).catch(error=>{
                logger.error(error);
            });
        });
    });
});

bot.use(newAuctionRouter);
bot.use(bidRouter);
bot.use(cancelAuctionRouter);

bot.start();

async function perpetualCheckAste(interval:number){

    
    let auctionsQuery:QueryResult = await db.getAuctionsToCheck();
    auctionsQuery.results.forEach(async auction=>{
        if(new Date() > auction.start_date && auction.status != "OPEN"){
            if((await db.getNotifyList(auction.channel_sequence)).results.length<auction.min_biders){
                await handleAuctionClosureEarly(auction);
            }else{
                await handleAuctionOpening(auction);
            }
        }else if(new Date() > auction.end_date){
            await handelAuctionClosure(auction);
        }else{

            notifyAt(3, 1, "end_date", auction, `L'asta "${auction.title}"(${auction.channel_sequence}) terminerà fra 3 secondi! \n${await composeNotifyList(auction)}`);
            notifyAt(10, 2, "end_date", auction, `L'asta "${auction.title}"(${auction.channel_sequence}) terminerà fra 10 secondi! \n${await composeNotifyList(auction)}`);
            notifyAt(60, 2, "end_date", auction, `L'asta "${auction.title}"(${auction.channel_sequence}) terminerà fra 1 minuto! \n${await composeNotifyList(auction)}`);
            notifyAt(60 * 10, 2, "end_date", auction, `L'asta "${auction.title}"(${auction.channel_sequence}) terminerà fra 10 minuti! \n${await composeNotifyList(auction)}`);
            
            notifyAt(10, 2, "start_date", auction, `L'asta "${auction.title}"(${auction.channel_sequence}) partirà tra 10 secondi! \n${await composeNotifyList(auction)}`);
            notifyAt(60, 2, "start_date", auction, `L'asta "${auction.title}"(${auction.channel_sequence}) partirà tra 1 minuto! \n${await composeNotifyList(auction)}`);
            notifyAt(60 * 10, 2, "start_date", auction, `L'asta "${auction.title}"(${auction.channel_sequence}) partirà tra 10 minuti! \n${await composeNotifyList(auction)}`);
        }
    });
    setTimeout(perpetualCheckAste, interval, interval);      
};

async function handleAuctionOpening(auction:any){
    logger.info(`Opening auction ${auction.channel_id} - ${auction.channel_sequence} - "${auction.title}"`, {service: "handleAuctionOpening"});
    let startedQuery:QueryResult = await db.startAuctionById(auction.channel_sequence);
    auction.status = "OPEN";

    replyToThread(auction, `L'asta "${auction.title}"(${auction.channel_sequence}) è iniziata, potete cominciare a fare le vostre offerte! \n${await composeNotifyList(auction)}`)
    updateAuctionMessage(auction);

    (await db.getAuctionOtherParticipants(-1, auction.channel_sequence)).results.forEach(participant=>{
        bot.api.sendMessage(participant.private_chat_id, `Ciao ${participant.user_name}(${participant.first_name}), l'asta "${auction.title}"(${auction.channel_sequence}) è iniziata, puoi cominciare a fare le tue offerte.`).catch(error=>{
            logger.error(error);
        });
    })
}

async function handelAuctionClosure(auction:any){
    logger.info(`Closing auction ${auction.channel_id} - ${auction.channel_sequence} - "${auction.title}"`, {service: "handelAuctionClosure"});
    let endQuery:QueryResult = await db.endAuctionById(auction.channel_sequence);
    let maxBidQuery:SingleQueryResult = await db.getAuctionMaxBid(auction.channel_sequence);
    auction.status = "ENDED";

    if(!maxBidQuery.result){
        replyToThread(auction, `L'asta "${auction.title}"(${auction.channel_sequence}) è terminata. Non c'e' stato alcun vincitore.`);
        (await db.getAuctionOtherParticipants(-1, auction.channel_sequence)).results.forEach(participant=>{
            bot.api.sendMessage(participant.private_chat_id, `L'asta "${auction.title}"(${auction.channel_sequence}) è terminata. Non c'e' stato alcun vincitore.`).catch(error=>{
                logger.error(error);
            });
        })
    }else{
        replyToThread(auction, `L'asta "${auction.title}"(${auction.channel_sequence}) è terminata, il vincitore è @${maxBidQuery.result.user_name}(${maxBidQuery.result?.first_name}) con l'offerta più alta di ${formatAuctionCurrency(maxBidQuery.result?.offer, auction)}, congratulazioni e grazie per aver partecipato! \n${await composeNotifyList(auction)}`);
        (await db.getAuctionOtherParticipants(-1, auction.channel_sequence)).results.forEach(participant=>{
            bot.api.sendMessage(participant.private_chat_id, `L'asta "${auction.title}"(${auction.channel_sequence}) è terminata, il vincitore è @${maxBidQuery.result?.user_name}(${maxBidQuery.result?.first_name}) con l'offerta più alta di ${formatAuctionCurrency(maxBidQuery.result?.offer, auction)}, grazie per aver partecipato!`).catch(error=>{
                logger.error(error);
            });
        })
    }

    updateAuctionMessage(auction);
}

async function handleAuctionClosureEarly(auction:any){
    logger.info(`Closing auction ${auction.channel_id} - ${auction.channel_sequence} - "${auction.title}" prematurely`, {service: "handleAuctionClosureEarly"});
    let endQuery:QueryResult = await db.endAuctionById(auction.channel_sequence);
    auction.status = "ENDED";
    replyToThread(auction, `L'asta "${auction.title}"(${auction.channel_sequence}) si è chiusa automaticamente, poichè non è stato raggiunto il numero minimo di partecipanti. \n${await composeNotifyList(auction)}`);
    updateAuctionMessage(auction);

    (await db.getAuctionOtherParticipants(-1, auction.channel_sequence)).results.forEach(participant=>{
        bot.api.sendMessage(participant.private_chat_id, `L'asta "${auction.title}"(${auction.channel_sequence}) si è chiusa automaticamente, poichè non è stato raggiunto il numero minimo di partecipanti.`).catch(error=>{
            logger.error(error);
        });
    })
}

perpetualCheckAste(1000);

async function notifyAt(secondsUntil:number, secondsWindow:number, dateField:string, auction:any, message:string){
    var secSinceLastUpdate = TimeUtils.getSecondiGlobaliRimanenti2(auction.last_notification, auction[dateField]);
    var secUntilObjective = TimeUtils.getSecondiGlobaliRimanenti(auction[dateField]);
    if(secUntilObjective<secondsUntil && secUntilObjective>secondsUntil-secondsWindow&& secSinceLastUpdate>secondsUntil){
        await db.updateNotificationAuction(auction.channel_id, auction.channel_sequence);
        replyToThread(auction, message);
    }
}

async function updateAuctionMessages(interval:number){
    
    (await db.getAuctionsToCheck()).results.forEach(auction=>{
        logger.info(`Update auction ${auction.channel_sequence}`);
        updateAuctionMessage(auction);
    });

    setTimeout(updateAuctionMessages, interval, interval);  
}

updateAuctionMessages(60000);