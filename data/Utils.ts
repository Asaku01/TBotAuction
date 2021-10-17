import winston from "winston";
import { bot } from "..";
import { db } from "./DBUtils";

export async function composeNotifyList(auction:any){
    let notifyList = (await db.getNotifyList(auction.channel_sequence)).results;
    let formattedList = "";
    notifyList.forEach(user=>{
        formattedList = formattedList.concat("@" + user.user_name + " ");
    });

    return formattedList;
}

export function unformatCurrency(value:string|undefined):number|undefined {
    if(!value) return;

    var regex = /^[$€¥][\d.,]+$/;
    if(!value.match(regex)) return;

    var capture = /(\D+)/g;
    var match = value.match(capture);

    var s_match:string[] = [];
    match?.forEach(val=>{
        if(!(s_match.includes(val))) s_match.push(val);
    });

    value = value.substr(1, value.length - 1);
    if(s_match.length == 2){
        value = value.split(s_match[1]).join(".");
    }
    
    if(s_match.length == 3){
        value = value.split(s_match[1]).join("")
        value = value.split(s_match[2]).join(".");
    }

    return Number(value);
}

export function formatAuctionCurrency(value:number | string, auction:any){
    if(auction){
        return formatCurrency(value, auction.currencyCountryCode??"en-US", {style: "currency", currency:auction.currency??"USD"});
    }else{
        return formatCurrency(value, "en-US", {style: "currency", currency:"USD"});
    }
}

export function formatCurrency(value:number|string, countryCode:string, formatConfig:{style:string, currency:string}){
    if(typeof value === "string") value = Number(value);
    return value.toLocaleString(countryCode, formatConfig);
}

export async function updateAuctionMessage(auction:any){

    logger.info(`Update auction message for "${auction.title}"(${auction.channel_sequence})`);

    let maxBid = (await db.getAuctionMaxBid(auction.channel_sequence)).result;

    return await bot.api.raw.editMessageCaption({
        chat_id: auction?.channel_id,
        message_id: auction?.channel_message_id,
        inline_message_id: "",
        caption: await getAuctionMessage(auction, maxBid),
        parse_mode: "HTML",
        caption_entities: undefined,
        reply_markup: undefined
      }).catch(error=>{
          logger.error(error);
      });
}

export async function getAuctionMessage(auction:any, maxBid:any):Promise<string>{

    let maxBiderMsg = "";
    if(maxBid){
        maxBiderMsg = `${formatAuctionCurrency(maxBid.offer, auction)} - @${maxBid.user_name}(${maxBid.first_name})`;
    }

    let notifyList = (await db.getNotifyList(auction.channel_sequence)).results;
    let formattedList = "";
    notifyList.forEach(user=>{
        formattedList = formattedList.concat(`\n@${user.user_name}(${user.first_name})`);
    });

    let remainingTimeUntilStart = auction.start_date < new Date()?"": `RIMANENTE: <b>${TimeUtils.getOreRimanenti(auction.start_date)}h${TimeUtils.getMinutiRimanenti(auction.start_date)}m</b>`;
    let remainingTimeUntilEnd = "";
    if(!remainingTimeUntilStart) remainingTimeUntilEnd = auction.end_date < new Date()?"": `RIMANENTE: <b>${TimeUtils.getOreRimanenti(auction.end_date)}h${TimeUtils.getMinutiRimanenti(auction.end_date)}m</b>`;


    let caption:string = 
`Asta: ${auction.title}
Descrizione: ${auction.description}
Stato: ${auction.status}

Data Partenza: ${auction.start_date?.toLocaleString("it-IT", {timeZone: "Europe/Rome"})} ${remainingTimeUntilStart}
Data Fine: ${auction.end_date?.toLocaleString("it-IT", {timeZone: "Europe/Rome"})} ${remainingTimeUntilEnd}
Prezzo Partenza: ${formatAuctionCurrency(auction.start_price, auction)}
Minimo Partecipanti: ${auction.min_biders}
Minimo Rialzo: ${formatAuctionCurrency(auction.min_bid, auction)}

Offerta piu' alta: ${maxBiderMsg}

ISCRITTI (${notifyList.length}/${auction.min_biders})
${formattedList}`;

    return caption;
}

export async function replyToThread(auction:any, message:string){
    logger.info(`Replying to thread for auction "${auction.title}"(${auction.channel_sequence}): ${message}`);
    return replyToMessage(auction.thread_channel_id, message, auction.thread_message_id);
}

export async function replyToMessage(channel_id:any, message:string, message_id:any){
    if(!channel_id) {
        logger.warn(`Trying to reply to a message (probably comment section) that doesn't exist. (bad channel_id)`)
        return;
    }

    return bot.api.sendMessage(channel_id, message,{
        reply_to_message_id: message_id
    }).catch(error=>{
        logger.error(error);
    });
}

export const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp({
            format: 'YYYY-MM-DD HH:mm:ss'
        }),
        winston.format.errors({ stack: true }),
        winston.format.splat(),
        winston.format.json()
    ),
    defaultMeta: { service: 'bot' },
    transports: [
        new winston.transports.File({ filename: 'errors.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs.log' })
    ]
});

//
// If we're not in production then **ALSO** log to the `console`
// with the colorized simple format.
//
if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
        )
    }));
}

export class TimeUtils{
    static handleError(chatId:number, error:any){
        console.log(error);
        //bot.telegram.sendMessage(charId, `An error occurred: ${error.message}`);
    }
    
    static getSecondiGlobaliRimanenti(date_end:Date){
        return this.getSecondiGlobaliRimanenti2(new Date(), date_end);
    }
    
    static getSecondiGlobaliRimanenti2(date_start:Date, date_end:Date){
        return (date_end.getTime() - date_start.getTime())/1000;
    }
    
    static getSecondiRimanenti(date:Date){
        return Math.floor((((date.getTime() - new Date().getTime())) - this.getOreRimanenti(date)*60*60*1000 - this.getMinutiRimanenti(date)*60*1000) / (1000));
    }
    
    static getMinutiRimanenti(date:Date){
        return Math.floor((((date.getTime() - new Date().getTime())) - this.getOreRimanenti(date)*60*60*1000) / (1000 * 60));
    }
    
    static getOreRimanenti(date:Date){
        return Math.floor((date.getTime() - new Date().getTime())/(1000*60*60));
    }
    
    static formatRemainingTime(date:Date){
        var hoursLeft = this.getOreRimanenti(date);
        var minutesLeft = this.getMinutiRimanenti(date);
        var secondsLeft = this.getSecondiRimanenti(date);
    
        if(hoursLeft < 0) return `- EXPIRED -`;
    
        var hoursLeftStr = (hoursLeft + "").padStart(2, "0");
        var minutesLeftStr = (minutesLeft + "").padStart(2, "0");
        var secondsLeftStr = (secondsLeft + "").padStart(2, "0");
    
        return `${hoursLeftStr}:${minutesLeftStr}:${secondsLeftStr}`;
    }

    static toDate(value:string, format:string){
        var normalized      = value.replace(/[^a-zA-Z0-9]/g, '-');
        var normalizedFormat= format.toLowerCase().replace(/[^a-zA-Z0-9]/g, '-');
        var formatItems     = normalizedFormat.split("-");
        var dateItems       = normalized.split("-");

        var monthIndex  = formatItems.indexOf("mm");
        var dayIndex    = formatItems.indexOf("dd");
        var yearIndex   = formatItems.indexOf("yyyy");
        var hourIndex     = formatItems.indexOf("hh");
        var minutesIndex  = formatItems.indexOf("ii");
        var secondsIndex  = formatItems.indexOf("ss");

        var today = new Date();

        var year  = yearIndex>-1  ? Number(dateItems[yearIndex])    : today.getFullYear();
        var month = monthIndex>-1 ? Number(dateItems[monthIndex])-1 : today.getMonth()-1;
        var day   = dayIndex>-1   ? Number(dateItems[dayIndex])     : today.getDate();

        var hour    = hourIndex>-1      ? Number(dateItems[hourIndex])    : today.getHours();
        var minute  = minutesIndex>-1   ? Number(dateItems[minutesIndex]) : today.getMinutes();
        //var second  = secondsIndex>-1   ? dateItems[secondsIndex] : today.getSeconds();

        return new Date(year,month,day,hour,minute);
    };
}

export const dateRegex = /([1-9]|([012][0-9])|(3[01]))\/([0]{0,1}[1-9]|1[012])\/\d\d\d\d\s([0-1]?[0-9]|2?[0-3]):([0-5]\d)$/;
export const dateRegexFormat = "dd/mm/yyyy hh:mm";