import { Router } from "@grammyjs/router";
import { InlineKeyboard, Keyboard } from "grammy";
import { db } from "../data/DBUtils";
import { formatAuctionCurrency, logger, replyToThread, updateAuctionMessage, unformatCurrency } from "../data/Utils";
import { AuctionContext } from "../types/AuctionContext";
import { newAuctionRouter } from "./insertAuction";

const bidRouter = new Router<AuctionContext>((ctx)=>ctx.session.step);

let alphabet = ["a", "b", "c", "d", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z"];

const nextRoute = {
    B_auction: goToRouteBidValue
}

/**
 * GO TO ROUTE BID
 * @param ctx
 */
 export async function goToRouteBid(ctx:AuctionContext){

    if((ctx.match as RegExpMatchArray)[1]){
        let arg = (ctx.match as RegExpMatchArray)[1].split("_")[1];
        if(arg && !Number.isNaN(Number(arg))){
            let auction_sequence = Number(arg);
            let auction = (await db.getAuctionBySequence(auction_sequence)).result;
            if(auction){
                if(auction.status != "OPEN"){
                    ctx.reply(`Ciao @${ctx.from?.username}(${ctx.from?.first_name}), l'asta deve ancora iniziare, ti sarà inviata una notifica appena sarà in stato "aperta"`);
                    logger.info("offer on an auction that is not open");
                    return;
                }
                ctx.session.B_auction = auction;
                await nextRoute.B_auction(ctx);
                return;
            }else{
                ctx.reply(`L'asta che cerchi non è stata trovata, prova a ridigitare il comando controllando il numero di asta ed il testo inseriti`);
            }
        }
    }

    
    let auctions = (await db.getUserOpenAuctions(ctx.from?.id??0)).results;
    
    if(auctions.length === 0){
        logger.info(`No auctions available for user @${ctx.from?.username}(${ctx.from?.first_name})`);
        ctx.reply(`Non risultano aste attive. Registrati ad una dal canale.`);
        ctx.session.step = "idle";
        return;
    }
    
    if(auctions.length === 1){
        logger.info(`Only one auction available: ${auctions[0].title}(${auctions[0].channel_sequence}})`);
        ctx.session.B_auction = auctions[0];
        nextRoute.B_auction(ctx);
        return;
    }

    let kb = new Keyboard();
    let auctionList = "";
    let index = 0;
    ctx.session.auctionIdMapping = new Map<string, string>();
    
    logger.info(`There are ${auctions.length} auctions available to bid on.`);
    
    auctions.forEach(auction=>{
        ctx.session.auctionIdMapping?.set(alphabet[index], auction.channel_sequence);
        auctionList = auctionList.concat(`${alphabet[index]}. ${auction.title} \n`);
        kb.text(alphabet[index++]);
    });

    ctx.session.step = "B_auction";

    await ctx.reply(`Seleziona l'asta su cui vuoi fare la tua puntata:\n\n${auctionList}`, {
        reply_markup:{
            one_time_keyboard:true,
            keyboard: kb.build()
        }
    });
}

bidRouter.route("B_auction", async(ctx, next)=>{
    if(!ctx.msg){
        logger.info(`User @${ctx.from?.username} - ${ctx.from?.first_name} did not send any msg while choosing an auction to bid on.`); 
        await ctx.reply(`Non hai inserito alcun numero d'asta, ti prego di immettere sempre l'asta su cui vuoi puntare, dopo aver digitato il comando /bid`);
        goToRouteBid(ctx);
        return;
    }

    let selected_auction_letter = ctx.msg.text;
    if(!alphabet.includes(selected_auction_letter??"")){
        logger.info(`User @${ctx.from?.username} - ${ctx.from?.first_name} did not choose any letter while choosing an auction to bid on.`); 
        await ctx.reply(`Mi dispiace ma hai selezionato un'asta non valida.`);
        goToRouteBid(ctx);
        return;
    }

    let auction_sequence = ctx.session.auctionIdMapping?.get(selected_auction_letter??"");

    let auction = (await db.getAuctionBySequence(Number(auction_sequence))).result;
    if(!auction){
        logger.info(`User @${ctx.from?.username} - ${ctx.from?.first_name} the selected letter ${selected_auction_letter}, corresponding to the auction ${ctx.session.auctionIdMapping?.get(selected_auction_letter??"")}, did not retrieve any result from database.`); 
        await ctx.reply(`Mi dispiace ma hai selezionato un'asta non valida.`);
        goToRouteBid(ctx);
        return;
    }

    ctx.session.B_auction = auction;

    await nextRoute.B_auction(ctx);
});

export async function goToRouteBidValue(ctx:AuctionContext){
    let auction = ctx.session.B_auction;
    
    let highest_bid = (await db.getAuctionMaxBid(auction?.channel_sequence)).result;
    
    let kb = new Keyboard();

    let value = Number(highest_bid?highest_bid.offer + auction.min_bid:auction.start_price);

    for(var i = 0; i<8; i++){
        if(i%4===0) kb.row();
        kb.text(formatAuctionCurrency((value+(i*Number(auction.min_bid))), auction));
    }
    kb.row().text("stop biding");

    ctx.session.step = "B_bidValue";

    await ctx.api.forwardMessage(ctx.chat?.id??"", auction?.channel_id, auction?.channel_message_id);

    await ctx.reply(`Hai selezionata l'asta "${auction.title}"(${auction.channel_sequence}). Seleziona un'importo indicato o digita nella riga di testo il valore che vuoi immettere per la tua puntata, rispettando sempre la puntata minima richiesta.`, {
        reply_markup:{
            one_time_keyboard:true,
            keyboard: kb.build()
        }
    });
}

bidRouter.route("B_bidValue", async(ctx, next)=>{
    if(!ctx.msg){
        await ctx.reply(`Il testo inserito non è valido, assicurati di aver inserito un valore numerico.`);
        return;
    }

    if(ctx.msg.text === "stop biding"){
        //await nextRoute.B_bidValue(ctx);
        ctx.session.step = "idle";
        await ctx.reply("Se cambi idea, usa il comando: /bid");
        return;
    }

    var bid:number;
    if(!!unformatCurrency(ctx.msg.text)){
        bid = unformatCurrency(ctx.msg.text)??0;
    }else if(Number.isNaN(Number(ctx.msg.text))){
        await ctx.reply(`Il testo inserito non è valido, assicurati di aver inserito un valore numerico.`);
        return;
    }else{
        bid = parseInt(ctx.msg.text ?? "0", 10);
    }
    
    let highest_bid = (await db.getAuctionMaxBid(ctx.session.B_auction.channel_sequence)).result
    console.log(highest_bid);
    
    if(bid < (highest_bid?.offer + ctx.session.B_auction.min_bid)){
        await ctx.reply(`La tua offerta è inferiore al prezzo raggiunto dal prodotto [@${highest_bid?.user_name}(${highest_bid?.first_name}) - ${formatAuctionCurrency(highest_bid?.offer, ctx.session.B_auction)}], ti preghiamo di inserire un importo maggiore di quello del prezzo raggiunto (${formatAuctionCurrency(highest_bid?.offer + ctx.session.B_auction.min_bid, ctx.session.B_auction)}+), rispettando il valore di puntata minima.`);
        return;
    }

    if(bid < ctx.session.B_auction.start_price){
        await ctx.reply(`La puntata è invalida, poichè inferiore al prezzo di partenza (${formatAuctionCurrency(ctx.session.B_auction.start_price, ctx.session.B_auction)}).`);
        return;
    }

    await db.insertBid(ctx.session.B_auction.channel_id, ctx.session.B_auction.channel_sequence, ctx.from?.id??0, ctx.from?.username??"", ctx.from?.first_name??"", bid);

    await updateAuctionMessage(ctx.session.B_auction);

    ctx.reply(`Congratulazioni, hai inviato la tua offerta (${formatAuctionCurrency(bid, ctx.session.B_auction)}) con successo!`);
    replyToThread(ctx.session.B_auction, `@${ctx.from?.username}(${ctx.from?.first_name}) ha offerto ${formatAuctionCurrency(bid, ctx.session.B_auction)}`);

    db.getAuctionOtherParticipants(ctx.from?.id??0, ctx.session.B_auction.channel_sequence).then(response=>{
        response.results.forEach(async otherParticipant=>{
            await ctx.api.sendMessage(otherParticipant.private_chat_id, `@${ctx.from?.username}(${ctx.from?.first_name}) ha offerto ${formatAuctionCurrency(bid, ctx.session.B_auction)} per l'asta "${ctx.session.B_auction.title}"!`);
            const keyboard = new Keyboard().text(`/bid_${ctx.session.B_auction.channel_sequence}`);
            if(otherParticipant.user_id == highest_bid?.user_id) await ctx.api.sendMessage(otherParticipant.private_chat_id, `Ciao @${highest_bid?.user_name}(${highest_bid?.first_name})! La tua offerta per l'asta "${ctx.session.B_auction.title}"(${ctx.session.B_auction.channel_sequence}) è stata superata da @${ctx.from?.username}(${ctx.from?.first_name}), vuoi rilanciare? /bid_${ctx.session.B_auction.channel_sequence}`,{
                reply_markup: keyboard
            });
        });
    });

    //goToRouteBidValue(ctx);
    ctx.session.step = "idle";
});

export {bidRouter};
