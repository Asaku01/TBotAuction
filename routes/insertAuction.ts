import { Router } from '@grammyjs/router';
import type { AuctionContext } from '../types/AuctionContext';
import { InlineKeyboard, Keyboard } from 'grammy';
import { InputMediaPhoto } from 'grammy/out/platform';
import { db } from '../data/DBUtils';
import { dateRegexFormat, logger, TimeUtils, formatCurrency, getAuctionMessage } from '../data/Utils';
import { isDataView } from 'util/types';

const newAuctionRouter = new Router<AuctionContext>((ctx)=>ctx.session.step);

let alphabet = ["a", "b", "c", "d", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z"];

const nextRoute = {
    channelId: goToRouteTitle,
    title: goToRouteDescription,
    description: goToRouteStartDate,
    startDate: goToRouteEndDate,
    endDate: goToRouteCurrency,
    currency: goToRouteStartPrice,
    startPrice: goToRouteMinPlayers,
    minPlayers: goToRouteMinBid,
    minBid: goToRouteCoverImageId,
    coverImageId: goToRouteOtherImagesId,
    otherImagesId: goToRouteFinale
}

async function goToNextRoute(id:"channelId"|"title"|"description"|"startDate"|"endDate"|"currency"|"startPrice"|"minPlayers"|"minBid"|"coverImageId"|"otherImagesId", ctx:AuctionContext){
    if(ctx.session.insertAuctionTempChange){
        goToRouteModifyAuctionBeforePublish(ctx);
        return;
    }
    return nextRoute[id](ctx);
}

async function goToRouteCurrency(ctx:AuctionContext){
    ctx.session.step = "currency";
    await ctx.reply(`What currency would you like to use for the auction?`, {
        reply_markup:{
            one_time_keyboard:true,
            keyboard: new Keyboard()
                .text("$").text("€").text("¥").build()
        }
    });
}

newAuctionRouter.route("currency", async (ctx, next)=>{
    if(!ctx.msg){
        await ctx.reply("You need to select one of the proposed currencies.");
        goToRouteCurrency(ctx);
        return;
    }

    switch(ctx.msg.text){
        case "$":{
            ctx.session.insertAuction.currency = "USD";
            ctx.session.insertAuction.currencyCountryCode = "en-US";
            break;
        }
        case "€":{
            ctx.session.insertAuction.currency = "EUR";
            ctx.session.insertAuction.currencyCountryCode = "it-IT";
            break;
        }
        case "¥":{
            ctx.session.insertAuction.currency = "JPY";
            ctx.session.insertAuction.currencyCountryCode = "ja-JP";
            break;
        }
        default:{
            await ctx.reply("You need to select one of the proposed currencies.");
            goToRouteCurrency(ctx);
            return;
        }
    }

    await goToNextRoute("currency", ctx);
});

/**
 * GO TO ROUTE CHANNEL ID
 * @param ctx
 */
export async function goToRouteChannelId(ctx:AuctionContext){
    
    let fromId = ctx.update?.message?.from?.id ?? 0;

    db.getUserChannels(fromId).then(async response=>{
        if(response.results.length<0){
            await ctx.reply("You don't have any channels registered! Add the bot to at least one of your channels to continue.");
            return;    
        }

        let kb = new Keyboard();
        let channelList = "Channel list:\n";
        let index = 0;
        ctx.session.channelIdMapping = new Map<string, string>();
        response.results.forEach(channel=>{
            ctx.session.channelIdMapping?.set(alphabet[index], channel.channel_id_sequence);
            channelList = channelList.concat(`${alphabet[index]}. ${channel.chat_title} \n`);
            kb.text(alphabet[index]);
            index++;
        })

        ctx.session.step = "channelId";
        await ctx.reply(`Which channel would you like to send the auction to?\n\n${channelList}`, {
            reply_markup:{
                one_time_keyboard:true,
                keyboard: kb.build()
            }
        });
    });
}

newAuctionRouter.route("channelId", async(ctx, next)=>{
    if(!ctx.msg){
        await ctx.reply("You need to select one of your channels. Retry.");
        goToRouteChannelId(ctx);
        return;
    }

    let selected_channel_letter = ctx.msg.text;
    if(!alphabet.includes(selected_channel_letter??"")){
        await ctx.reply("You need to select one of your channels. Retry.");
        goToRouteChannelId(ctx);
        return;
    }

    let added_by_increment = ctx.session.channelIdMapping?.get(selected_channel_letter??"");

    let added_by_id = ctx.update?.message?.from?.id ?? 0;

    console.log(`PREPARING TO RETRIEVE CHANNEL ${added_by_increment}`);
    db.getChannelByUser(added_by_id, Number(added_by_increment)).then(async response=>{
        
        console.log("CHANNEL RETRIEVED");
        if(!response.result){
            await ctx.reply("You need to select one of your channels. Retry.");
            goToRouteChannelId(ctx);
            return;
        }

        ctx.session.insertAuction.channelId = response.result.channel_id;

        await goToNextRoute("channelId", ctx);
    });
});

/**
 * 
 * @param ctx GO TO ROUTE TITLE
 */
async function goToRouteTitle(ctx:AuctionContext){
    ctx.session.step = "title";
    await ctx.reply("Tell me a title for the auction.");
}

newAuctionRouter.route("title", async(ctx, next)=>{
    if(!ctx.msg){
        await ctx.reply("You need to write the title of the auction. Retry.");
        return;
    }
    
    const title = ctx.msg.text ?? "";
    ctx.session.insertAuction.title = title;

    await goToNextRoute("title", ctx);
});

/**
 * GO TO ROUTE DESCRIPTION
 * @param ctx 
 */
async function goToRouteDescription(ctx:AuctionContext){
    ctx.session.step = "description";
    await ctx.reply("Good, now tell me a description.");
}

newAuctionRouter.route("description", async(ctx)=>{
    if(!ctx.msg){
        await ctx.reply("You need to write a small description of the auction. Retry.");
        return;
    }
    
    const description = ctx.msg.text ?? "";
    ctx.session.insertAuction.description = description;

    await goToNextRoute("description", ctx);
});


newAuctionRouter.route("startDate", async (ctx)=>{
    const dateRegex = new RegExp(/^([1-9]|([012][0-9])|(3[01]))\/([0]{0,1}[1-9]|1[012])\/\d\d\d\d\s([0-1]?[0-9]|2?[0-3]):([0-5]\d)$/);

    logger.info(`given start date: ${ctx.msg?.text}`);

    var data;

    if(ctx.msg?.text === "now"){
        data = new Date();
    }else{
        if(!(dateRegex.test(ctx.msg?.text ?? ""))){
            await ctx.reply(`Invalid Date. Expected format: ${dateRegexFormat}`);
            return;
        }

        var dataStr = ctx.msg?.text ?? "";
        data = TimeUtils.toDate(dataStr, "dd/mm/yyyy hh:ii:ss");
        
        if(data < new Date()){
            await ctx.reply(`You can't choose a starting date prior to now.`);
            return;
        }
    }

    logger.info(`converted start date: ${data.toLocaleString("it-IT", {timeZone: "Europe/Rome"})}`);

    ctx.session.insertAuction.startDate = data;

    await goToNextRoute("startDate", ctx);
});

/**
 * 
 * @param ctx GO TO ROUTE START DATE
 */
async function goToRouteStartDate(ctx:AuctionContext){
    ctx.session.step = "startDate";
    await ctx.reply(`When will the auction start? Use the ${dateRegexFormat} format in your reply.`, {
        reply_markup:{
            one_time_keyboard:true,
            keyboard: new Keyboard()
                .text("now").build()
        }
    });
}

newAuctionRouter.route("endDate", async (ctx)=>{
    const dateRegex = /([1-9]|([012][0-9])|(3[01]))\/([0]{0,1}[1-9]|1[012])\/\d\d\d\d\s([0-1]?[0-9]|2?[0-3]):([0-5]\d)$/;

    const timeDeltaRegex = /^(\d+h)*(\d+m)*$/;

    logger.info(`given end date: ${ctx.msg?.text}`);

    var data;

    if(ctx.msg?.text && (timeDeltaRegex.test(ctx.msg?.text??""))){
        var arg = ctx.msg.text;
        var h = 0;
        var m = 0;
        if(arg.indexOf("h")>-1) h = Number(arg.substring(0, arg.indexOf("h")));
        if(arg.indexOf("m")>-1) m = Number(arg.substring(arg.indexOf("h")+1, arg.indexOf("m")));
        data = new Date(ctx.session.insertAuction.startDate as Date);
        
        logger.info(`delta hours: ${h} delta minutes: ${m}`);
        
        data?.setHours(data.getHours() + h);
        data?.setMinutes(data.getMinutes() + m);
    }else{
        if(!(dateRegex.test(ctx.msg?.text ?? ""))){
            await ctx.reply(`Invalid Date. Expected format: ${dateRegexFormat}`);
            return;
        }

        var dataStr = ctx.msg?.text ?? "";
        data = TimeUtils.toDate(dataStr, "dd/mm/yyyy hh:ii:ss");

        if(data < new Date()){
            await ctx.reply(`You can't choose an ending date prior to now.`);
            return;
        }

        if(data < (ctx.session.insertAuction.startDate??new Date())){
            await ctx.reply(`You can't choose an ending date prior to the starting date.`);
            return;
        }
    }

    logger.info(`converted end date: ${data?.toLocaleString("it-IT", {timeZone: "Europe/Rome"})}`);

    ctx.session.insertAuction.endDate = data;

    await goToNextRoute("endDate", ctx);
});

async function goToRouteEndDate(ctx:AuctionContext){
    ctx.session.step = "endDate";
    await ctx.reply(`When will the auction end? Use the ${dateRegexFormat} format in your reply. Alternatively you can use the "1h30m" format to indicate the duration of the auction.`,{
        reply_markup:{
            one_time_keyboard:true,
            keyboard: new Keyboard()
                .text("10m").text("30m").text("1h").text("1h30m").text("2h").text("2h30m").build()
        }
    });
}

/**
 * GO TO ROUTE START PRICE
 * @param ctx 
 */
async function goToRouteStartPrice(ctx:AuctionContext){
    ctx.session.step = "startPrice";
    await ctx.reply("What's the starting price? (click one of the proposed values or type a custom one)", {
        reply_markup:{
            one_time_keyboard:true,
            keyboard: new Keyboard()
                .text("5").text("10").text("15").text("20").row()
                .text("25").text("30").text("35").text("40").build()
        }
    });
}

newAuctionRouter.route("startPrice", async(ctx)=>{
    if(!ctx.msg){
        await ctx.reply("You need to write a starting price. Retry.");
        return;
    }

    if(Number.isNaN(Number(ctx.msg.text))){
        await ctx.reply("You need to write a valid starting price. Use only numbers. Retry.");
        return;
    }

    const startPrice = parseInt(ctx.msg.text ?? "0", 10);
    ctx.session.insertAuction.startPrice = startPrice;
    
    await goToNextRoute("startPrice", ctx);
});

/**
 * GO TO ROUTE MINIMUM PLAYERS
 * @param ctx 
 */
 async function goToRouteMinPlayers(ctx:AuctionContext){
    if((ctx.session.insertAuction.startDate??new Date()) < new Date()){
        logger.info("You've chosen to start the auction immediately.");
        ctx.session.insertAuction.minPlayers = 0;
        await goToNextRoute("minPlayers", ctx);
        return;
    }

    ctx.session.step = "minPlayers";    
    var kb = new Keyboard();
        
    await ctx.reply("What's the minimum number of biders? (click one of the proposed values or type a custom one)", {
        reply_markup:{
            one_time_keyboard:true,
            keyboard: new Keyboard()
                .text("0").text("1").text("2").text("5").row()
                .text("10").text("15").text("20").text("25").build()
        }
    });
}

newAuctionRouter.route("minPlayers", async(ctx)=>{
    if(!ctx.msg){
        await ctx.reply("You need to write a minimum number of biders. Retry.");
        return;
    }

    if(Number.isNaN(Number(ctx.msg.text))){
        await ctx.reply("You need to write a valid minimum number of players. Use only numbers. Retry.");
        return;
    }

    const minPlayers = parseInt(ctx.msg.text ?? "0", 10);
    ctx.session.insertAuction.minPlayers = minPlayers;
    
    await goToNextRoute("minPlayers", ctx);
});

/**
 * GO TO ROUTE MINIMUM BID
 * @param ctx 
 */
 async function goToRouteMinBid(ctx:AuctionContext){
    ctx.session.step = "minBid";
    await ctx.reply("What's the minimum bid value? (click one of the proposed values or type a custom one)", {
        reply_markup:{
            one_time_keyboard:true,
            keyboard: new Keyboard()
                .text("1").text("2").text("5").row()
                .text("10").text("15").text("20").build()
        }
    });
}

newAuctionRouter.route("minBid", async(ctx)=>{
    if(!ctx.msg){
        await ctx.reply("You need to write a minimum bid. Retry.");
        return;
    }

    if(Number.isNaN(Number(ctx.msg.text))){
        await ctx.reply("You need to write a valid minimum bid. Use only numbers. Retry.");
        return;
    }

    const minBid = parseInt(ctx.msg.text ?? "0", 10);
    ctx.session.insertAuction.minBid = minBid;
    
    await goToNextRoute("minBid", ctx);
});

/**
 * GO TO ROUTE COVER IMAGE ID
 * @param ctx 
 */
async function goToRouteCoverImageId(ctx:AuctionContext){
    ctx.session.step = "coverImageId";
    await ctx.reply(`Give me an image to use as cover.`);
}

newAuctionRouter.route("coverImageId", async(ctx)=>{
    ctx.session.insertAuction.otherImagesId = [];

    const photo = ctx.msg?.photo??[];
    if(photo.length<1){
        await ctx.reply("Photo not valid, retry;");
        return;
    }
    
    const photoId = photo[photo.length-1].file_id;    
    ctx.session.insertAuction.coverImageId = photoId;
    
    await goToNextRoute("coverImageId", ctx);

    /*ctx.replyWithPhoto(photoId, {
        caption: `Great, your auction is:\n\n\n${ctx.session.title}\n\n${ctx.session.description}\nminPrice: ${ctx.session.minPrice}`
    });*/
});


/**
 * GO TO ROUTE OTHER IMAGES ID
 * @param ctx 
 */
async function goToRouteOtherImagesId(ctx:AuctionContext){
    ctx.session.step = "otherImagesId";
    ctx.reply("Now give me some other views of the item to make it easier for people to inspect it. When done press on the done button or type 'done'", {
        reply_markup:{
            one_time_keyboard:true,
            keyboard: new Keyboard().text("done").build()
        }
    });
}

newAuctionRouter.route("otherImagesId", async(ctx)=>{
    if(!!ctx.msg?.text){
        if(ctx.msg.text == "done"){
            await ctx.reply("Great, I got your images.");
            await goToNextRoute("otherImagesId", ctx);
        }else{
            ctx.reply("please either send a photo or the message 'done'. ");
        }
        return;
    }

    const photo = ctx.msg?.photo??[];
    if(photo.length<1) return await("Photo not valid, retry;");
    
    const photoId = photo[photo.length-1].file_id;    

    ctx.session.insertAuction.otherImagesId?.push(photoId);
});

async function getAuctionMessagePreview(ctx:AuctionContext, maxBid:any){
    let imgList:Array<InputMediaPhoto> = [{
        type: "photo",
        media: ctx.session.insertAuction.coverImageId??"",
        caption: await getAuctionMessage(convertCtxToAuction(ctx), null),
        parse_mode: "HTML",
        caption_entities: undefined
    }];
    
    ctx.session.insertAuction.otherImagesId?.forEach((element)=>{
        imgList.push({
            type: "photo",
            media: element,
            caption: "",
            parse_mode: undefined,
            caption_entities: undefined
        });
    });
    
    return imgList;
}

async function goToRouteModifyAuctionBeforePublish(ctx: AuctionContext){
    ctx.session.step = "modifyAuctionBeforePublish";
    await ctx.reply("What would you like to modify?", {
        reply_markup:{
            one_time_keyboard:true,
            keyboard: new Keyboard()
                .text("channel").row()
                .text("title").row()
                .text("description").row()
                .text("start date").row()
                .text("end date").row()
                .text("start price").row()
                .text("min players").row()
                .text("min bid").row()
                .text("cover image").row()
                .text("additional images").row()
                .text("currency").row()
                .text("finish").build()
        }
    });
}

newAuctionRouter.route("modifyAuctionBeforePublish", async(ctx)=>{

    switch(ctx.msg?.text){
        case "channel": {
            ctx.session.insertAuctionTempChange = true;
            goToRouteChannelId(ctx);
            break;
        }
        case "title":{
            ctx.session.insertAuctionTempChange = true;
            goToRouteTitle(ctx);
            break;
        }
        case "description":{
            ctx.session.insertAuctionTempChange = true;
            goToRouteDescription(ctx);
            break;
        }
        case "start date":{
            ctx.session.insertAuctionTempChange = true;
            goToRouteStartDate(ctx);
            break;
        }
        case "end date":{
            ctx.session.insertAuctionTempChange = true;
            goToRouteEndDate(ctx);
            break;
        }
        case "start price":{
            ctx.session.insertAuctionTempChange = true;
            goToRouteStartPrice(ctx);
            break;
        }
        case "min players":{
            ctx.session.insertAuctionTempChange = true;
            goToRouteMinPlayers(ctx);
            break;
        }
        case "min bid":{
            ctx.session.insertAuctionTempChange = true;
            goToRouteMinBid(ctx);
            break;
        }
        case "cover image":{
            ctx.session.insertAuctionTempChange = true;
            goToRouteCoverImageId(ctx);
            break;
        }
        case "additional images":{
            ctx.session.insertAuctionTempChange = true;
            goToRouteOtherImagesId(ctx);
            break;
        }
        case "currency":{
            ctx.session.insertAuctionTempChange = true;
            goToRouteCurrency(ctx);
            break;
        }
        case "finish":{
            goToRouteFinale(ctx);
            break;
        }
        default: {
            ctx.reply("You must select one of the options. Retry.")
        }
    }
});

/**
 * GO TO ROUTE IDLE
 * @param ctx 
 */
 async function goToRouteFinale(ctx:AuctionContext){
    ctx.session.step = "finale";

    await ctx.reply("What would you like to do now? You can either preview the bid or proceed to publish it.", {
        reply_markup:{
            one_time_keyboard:true,
            keyboard: new Keyboard()
                .text("preview").row()
                .text("modify auction").row()
                .text("cancel")
                .text("save and publish").build()
        }
    });
}

newAuctionRouter.route("finale", async(ctx)=>{
    ctx.session.insertAuctionTempChange = false;

    try{

    if(ctx.msg?.text === "modify auction"){
        goToRouteModifyAuctionBeforePublish(ctx);
        return;
    }

    if(ctx.msg?.text === "cancel"){
        ctx.session.step = "idle";
        return;
    }

    if(ctx.msg?.text === "preview"){
        await ctx.reply("One preview coming up!");
        await ctx.api.sendMediaGroup(ctx.update.message?.chat?.id + "", await getAuctionMessagePreview(ctx, null)).catch(error=>{
            ctx.reply("Something went wrong, if you're not saying any further description, check the logs.").catch(error=>{
                logger.error(`Error during error notification to user @${ctx.from?.username}(${ctx.from?.first_name}): ${JSON.stringify(error)}`);
            });
        
            ctx.reply("An error occurred, please fix the auction information and then retry: " + JSON.stringify(error)).catch(error=>{
                logger.error(`Error during error notification to user @${ctx.from?.username}(${ctx.from?.first_name}): ${JSON.stringify(error)}`);
            });
        });
        goToRouteFinale(ctx);
        return;
    }

    if(ctx.msg?.text === "save and publish"){
        await ctx.api.sendMediaGroup(ctx.session.insertAuction.channelId + "", await getAuctionMessagePreview(ctx, null)).then(async response=>{
            let messageId:number = 0;
            if(response.length>0) messageId = response[0].message_id;
            let update_data = (await db.insertAuction(ctx.session.insertAuction.channelId ?? 0, ctx.session.insertAuction.title ?? "", ctx.session.insertAuction.description ?? "", ctx.session.insertAuction.startDate?.toLocaleString("it-IT", {timeZone: "Europe/Rome"}).replace(",","")??"", ctx.session.insertAuction.endDate?.toLocaleString("it-IT", {timeZone: "Europe/Rome"}).replace(",","")??"", ctx.session.insertAuction.startPrice??0, ctx.session.insertAuction.minPlayers??0, ctx.session.insertAuction.minBid??0, ctx.session.insertAuction.coverImageId??"", ctx.session.insertAuction.otherImagesId?.join()??"", ctx.from?.username??"", ctx.from?.id??0, messageId, ctx.session.insertAuction.currency??"", ctx.session.insertAuction.currencyCountryCode??"")).result;
            
            const inlineKeyboard = new InlineKeyboard()/*.text("register", `register_user_for_auction:${update_data.insertId}`)*/.url("registrati", `https://t.me/TBAuctionBot?start=${update_data.insertId}`);
            await ctx.api.sendMessage(ctx.session.insertAuction.channelId + "", "Register to the above auction by clicking the button below.",{
                reply_markup: inlineKeyboard
            }).catch(error=>{
                logger.error(error);
            });
        }).catch(error=>{
            ctx.reply("Something went wrong, if you're not seeing any further description, check the logs.").catch(error=>{
                logger.error(`Error during error notification to user @${ctx.from?.username}(${ctx.from?.first_name}): ${JSON.stringify(error)}`);
            });
        
            ctx.reply("An error occurred, you cannot publish this auction: " + JSON.stringify(error)).catch(error=>{
                logger.error(`Error during error notification to user @${ctx.from?.username}(${ctx.from?.first_name}): ${JSON.stringify(error)}`);
            });

            goToRouteFinale(ctx);
        });

        //let auction = (await db.getAuctionBySequence(update_data.insertId)).result;

        /*ctx.api.sendMessage(auction?.thread_channel_id, `INSTRUCTIONS:
- The auction will remain in "PENDING" state until the start date will be reached.
- Biding is enabled only after the auction will be "OPEN".
- You can bid by typing a number. ex: "33"
- Text messages or messages containing numbers will not be considered bids. ex: "hello", "bid 33"
- Invalid bids will be removed by the bot.`,{
            reply_to_message_id: auction?.thread_message_id
        });*/
    }
    }catch(error){
        logger.error(error);
    }

});

function convertCtxToAuction(ctx:AuctionContext){

    let auction:any = {};
    auction.status = "PENDING";
    auction.channel_id = ctx.session.insertAuction.channelId;
    auction.channel_sequence = 0;
    auction.title = ctx.session.insertAuction.title;
    auction.description = ctx.session.insertAuction.description;
    auction.start_date = ctx.session.insertAuction.startDate;
    auction.end_date = ctx.session.insertAuction.endDate;
    auction.start_price = ctx.session.insertAuction.startPrice;
    auction.min_biders = ctx.session.insertAuction.minPlayers;
    auction.min_bid = ctx.session.insertAuction.minBid;
    auction.cover_image_id = ctx.session.insertAuction.coverImageId;
    auction.other_images_id = ctx.session.insertAuction.otherImagesId;
    auction.currency_country_code = ctx.session.insertAuction.currencyCountryCode;
    auction.currency = ctx.session.insertAuction.currency;

    return auction;
}

export {newAuctionRouter};