import { Router } from "@grammyjs/router";
import { InlineKeyboard, Keyboard } from "grammy";
import { db } from "../data/DBUtils";
import { formatAuctionCurrency, logger, replyToThread, updateAuctionMessage, unformatCurrency, composeNotifyList } from "../data/Utils";
import { AuctionContext } from "../types/AuctionContext";
import { newAuctionRouter } from "./insertAuction";

const cancelAuctionRouter = new Router<AuctionContext>((ctx)=>ctx.session.step);

let alphabet = ["a", "b", "c", "d", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z"];

const nextRoute = {
    cancelAuctionSelectChannel: goToRouteCancelAuctionSelectAuction,
    cancelAuctionSelectAuction: goToRouteCancelAuctionConfirm
}

export async function goToRouteCancelAuctionSelectChannel(ctx:AuctionContext){
    let fromId = ctx.update?.message?.from?.id ?? 0;

    let channels = (await db.getUserChannels(fromId)).results;

    if (channels.length < 0) {
        await ctx.reply("You don't have any channels registered! Add the bot to at least one of your channels to continue.");
        return;
    }

    if (channels.length === 1) {
        logger.info(`Only one channel available: ${channels[0].chat_title}(${channels[0].channel_id}})`);
        ctx.session.cancelAuction.channel = channels[0];
        nextRoute.cancelAuctionSelectChannel(ctx);
        return;
    }

    let kb = new Keyboard();
    let channelList = "Channel list:\n";
    let index = 0;
    ctx.session.channelIdMapping = new Map<string, string>();
    channels.forEach(channel => {
        ctx.session.channelIdMapping?.set(alphabet[index], channel.channel_id_sequence);
        channelList = channelList.concat(`${alphabet[index]}. ${channel.chat_title} \n`);
        kb.text(alphabet[index]);
        index++;
    })

    ctx.session.step = "cancelAuctionSelectChannel";
    await ctx.reply(`Which channel would you like to cancel the auction on?\n\n${channelList}`, {
        reply_markup: {
            one_time_keyboard: true,
            keyboard: kb.build()
        }
    });
}

newAuctionRouter.route("cancelAuctionSelectChannel", async(ctx, next)=>{
    if(!ctx.msg){
        await ctx.reply("You need to select one of your channels. Retry.");
        goToRouteCancelAuctionSelectChannel(ctx);
        return;
    }

    let selected_channel_letter = ctx.msg.text;
    if(!alphabet.includes(selected_channel_letter??"")){
        await ctx.reply("You need to select one of your channels. Retry.");
        goToRouteCancelAuctionSelectChannel(ctx);
        return;
    }

    let added_by_increment = ctx.session.channelIdMapping?.get(selected_channel_letter??"");

    let added_by_id = ctx.update?.message?.from?.id ?? 0;

    console.log(`PREPARING TO RETRIEVE CHANNEL ${added_by_increment}`);
    db.getChannelByUser(added_by_id, Number(added_by_increment)).then(async response=>{
        
        console.log("CHANNEL RETRIEVED");
        if(!response.result){
            await ctx.reply("You need to select one of your channels. Retry.");
            goToRouteCancelAuctionSelectChannel(ctx);
            return;
        }

        ctx.session.cancelAuction.channel = response.result;

        await nextRoute.cancelAuctionSelectChannel(ctx);
    });
});

/**
 * GO TO ROUTE BID
 * @param ctx
 */
 async function goToRouteCancelAuctionSelectAuction(ctx:AuctionContext){
    
    let auctions = (await db.getOpenOrPendingAuctionsByChannel(ctx.session.cancelAuction.channel.channel_id)).results;
    
    if(auctions.length === 0){
        logger.info(`No auctions available for user @${ctx.from?.username}(${ctx.from?.first_name})`);
        ctx.reply(`There are no "OPEN" or "PENDING" auction on the channel "${ctx.session.cancelAuction.channel.chat_title}".`);
        ctx.session.step = "idle";
        return;
    }
    
    if(auctions.length === 1){
        logger.info(`Only one auction available: ${auctions[0].title}(${auctions[0].channel_sequence}})`);
        ctx.session.cancelAuction.auction = auctions[0];
        nextRoute.cancelAuctionSelectAuction(ctx);
        return;
    }

    let kb = new Keyboard();
    let auctionList = "Available auctions:\n";
    let index = 0;
    ctx.session.auctionIdMapping = new Map<string, string>();
    
    logger.info(`There are ${auctions.length} auctions available to bid on.`);
    
    auctions.forEach(auction=>{
        ctx.session.auctionIdMapping?.set(alphabet[index], auction.channel_sequence);
        auctionList = auctionList.concat(`${alphabet[index]}. ${auction.title} \n`);
        kb.text(alphabet[index++]);
    });

    ctx.session.step = "cancelAuctionSelectAuction";

    await ctx.reply(`Which auction would you like to cancel?\n\n${auctionList}`, {
        reply_markup:{
            one_time_keyboard:true,
            keyboard: kb.build()
        }
    });
}

cancelAuctionRouter.route("cancelAuctionSelectAuction", async(ctx, next)=>{
    if(!ctx.msg){
        logger.info(`User @${ctx.from?.username} - ${ctx.from?.first_name} did not send any msg while choosing an auction to cancel.`); 
        await ctx.reply("You need to select one of your auctions. Retry.");
        goToRouteCancelAuctionSelectAuction(ctx);
        return;
    }

    let selected_auction_letter = ctx.msg.text;
    if(!alphabet.includes(selected_auction_letter??"")){
        logger.info(`User @${ctx.from?.username} - ${ctx.from?.first_name} did not choose any letter while choosing an auction to bid on.`); 
        await ctx.reply("You need to select one of your auctions. Retry.");
        goToRouteCancelAuctionSelectAuction(ctx);
        return;
    }

    let auction_sequence = ctx.session.auctionIdMapping?.get(selected_auction_letter??"");

    let auction = (await db.getAuctionBySequence(Number(auction_sequence))).result;
    if(!auction){
        logger.info(`User @${ctx.from?.username} - ${ctx.from?.first_name} the selected letter ${selected_auction_letter}, corresponding to the auction ${ctx.session.auctionIdMapping?.get(selected_auction_letter??"")}, did not retrieve any result from database.`); 
        await ctx.reply("You need to select one of your auctions. Retry.");
        goToRouteCancelAuctionSelectAuction(ctx);
        return;
    }

    ctx.session.cancelAuction.auction = auction;

    await nextRoute.cancelAuctionSelectAuction(ctx);
});

export async function goToRouteCancelAuctionConfirm(ctx:AuctionContext){
    let auction = ctx.session.cancelAuction.auction;
    
    ctx.session.step = "cancelAuctionConfirm";
    await ctx.api.forwardMessage(ctx.chat?.id??"", auction?.channel_id, auction?.channel_message_id);

    ctx.reply(`Are you sure you wish to cancel the auction "${auction.title}"(${auction.channel_sequence})?`,{
        reply_markup:{
            one_time_keyboard:true,
            keyboard: new Keyboard().text("yes").text("no").build()
        }
    })
}

cancelAuctionRouter.route("cancelAuctionConfirm", async(ctx, next)=>{
    if(!ctx.msg){
        await ctx.reply("You need to select 'yes' or 'no'. Retry.");
        return;
    }

    if(ctx.msg.text === "no"){
        ctx.session.step = "idle";
        await ctx.reply("Ok, glad you've changed your mind.");
        return;
    }

    if(ctx.msg.text === "yes"){
        ctx.session.step = "idle";

        await db.cancelAuctionById(ctx.session.cancelAuction.auction.channel_sequence);
        ctx.session.cancelAuction.auction.status = "CANCELED";
        await updateAuctionMessage(ctx.session.cancelAuction.auction);

        await replyToThread(ctx.session.cancelAuction.auction, `L'asta "${ctx.session.cancelAuction.auction.title}"(${ctx.session.cancelAuction.auction.channel_sequence}) e' stata cancellata. Ci scusiamo per l'inconvenienza. \n${await composeNotifyList(ctx.session.cancelAuction.auction)}`);

        let participants = (await db.getAuctionOtherParticipants(-1, ctx.session.cancelAuction.auction.channel_sequence)).results
        await participants.forEach(participant=>{
            ctx.api.sendMessage(participant.private_chat_id, `L'asta "${ctx.session.cancelAuction.auction.title}"(${ctx.session.cancelAuction.auction.channel_sequence}) e' stata cancellata. Ci scusiamo per l'inconvenienza.`);
        })

        await ctx.reply("Auction cancelled, all participants have been notified.");
        return;
    }
});

export {cancelAuctionRouter};
