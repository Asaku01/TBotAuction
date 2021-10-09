import { channel } from "diagnostics_channel";
import { createConnection, createPool, FieldPacket, OkPacket, Pool, RowDataPacket } from "mysql2";
import Connection from "mysql2/typings/mysql/lib/Connection";
import Query from "mysql2/typings/mysql/lib/protocol/sequences/Query";
import { resourceLimits } from "worker_threads";

export const connectionData = {
    host     : process.env.RDS_HOSTNAME??'',
    user     : process.env.DB_USERNAME??'',
    password : process.env.DB_PASSWORD??'',
    database : process.env.RDS_DATABASE??'',
    port     : Number(process.env.RDS_PORT)??6033,
    connectionLimit : 10,
    queueLimit: 0,
    waitForConnections: true
};

export interface QueryResult{
    results:RowDataPacket[],
    fields:FieldPacket[]
}

export interface SingleQueryResult{
    result:RowDataPacket|undefined,
    fields:FieldPacket[]
}

export interface InsertQueryResult{
    result: OkPacket,
    fields: FieldPacket[]
}

export class MSQLDB{
    connection: Pool;

    constructor(){
        this.connection = createPool(connectionData);//createConnection(connectionData);
        this.connection.connect();
    }

    doQuery(sql:string):Promise<QueryResult>{
        return new Promise((resolve, reject)=>{
            this.connection.query(sql, function(error, results, fields){
                if(error) reject(error);
                resolve({results:<RowDataPacket[]>results, fields:fields});
            });
        });
    }

    doInsert(sql:string):Promise<InsertQueryResult>{
        return new Promise((resolve, reject)=>{
            this.connection.query(sql, function(error, results, fields){
                if(error) reject(error);
                resolve({result: <OkPacket>results, fields:fields});
            });
        });
    }

    getAuctionsToCheck():Promise<QueryResult>{
        var sql = `SELECT * FROM Auctions WHERE status = "OPEN" OR status = "PENDING"`;
        return this.doQuery(sql);
    }

    getUserChannels(user_id:number):Promise<QueryResult>{
        var sql = `SELECT * FROM Channels WHERE added_by_id = "${user_id}"`;
        return this.doQuery(sql);
    }
    
    updateChannelStatus(channel_id:number, chat_status:string):Promise<QueryResult>{
        var sql = `UPDATE Channels SET chat_status = "${chat_status}" WHERE channel_id = "${channel_id}"`;
        return this.doQuery(sql);
    }

    deleteChannel(channel_id:number):Promise<QueryResult>{
        var sql = `DELETE FROM Channels WHERE channel_id = "${channel_id}"`;
        return this.doQuery(sql);
    }
    
    addChannel(channel_id:number, chat_title:string, chat_username:string, chat_type:string, chat_status:string, added_by:string, added_by_id:number):Promise<QueryResult>{
        var sql = `INSERT INTO Channels (channel_id, chat_title, chat_username, chat_type, chat_status, added_by, added_by_id, insert_date, update_date) VALUES("${channel_id}", "${chat_title}", "${chat_username}", "${chat_type}", "${chat_status}", "${added_by}", "${added_by_id}", NOW(), NOW())`;
        return this.doQuery(sql);
    }
    
    getChannelByUser(added_by_id:number, channel_id_sequence:number):Promise<SingleQueryResult>{
        var sql = `SELECT * FROM Channels WHERE added_by_id = "${added_by_id}" AND channel_id_sequence = "${channel_id_sequence}"`;
        return this.doQuery(sql).then((response)=>{
            if(response.results.length === 0) return new Promise((resolve, reject)=>{resolve({result:undefined, fields:response.fields})});
            return new Promise((resolve, reject)=>{resolve({result:response.results[0], fields:response.fields})});
        });
    }

    getChannelById(channel_id:number):Promise<SingleQueryResult>{
        var sql = `SELECT * FROM Channels WHERE channel_id = "${channel_id}"`;
        return this.doQuery(sql).then((response)=>{
            if(response.results.length === 0) return new Promise((resolve, reject)=>{resolve({result:undefined, fields:response.fields})});
            return new Promise((resolve, reject)=>{resolve({result:response.results[0], fields:response.fields})});
        });
    }
    
    getChannels():Promise<QueryResult>{
        var sql = `SELECT * FROM Channels`;
        return this.doQuery(sql);
    }
    
    updateNotificationAuction(channel_id:number, channel_sequence:number):Promise<QueryResult>{
        var sql = `UPDATE Auctions SET last_notification = NOW() WHERE channel_id = ${channel_id} AND channel_sequence = ${channel_sequence}`;
        return this.doQuery(sql);
    }
    
    insertAuction(channel_id:number, title:string, description:string, start_date:string, end_date:string, start_price:number, min_biders:number, min_bid:number, cover_image_id:string, other_images_id:string, created_by_user:string, created_by_user_id:number, channel_message_id:number, currency:string, currency_country_code:string):Promise<InsertQueryResult>{
        var sql = `INSERT INTO Auctions (channel_id, title, description, start_date, end_date, start_price, min_biders, min_bid, cover_image_id, other_images_id, created_by_user, created_by_user_id, created_at, status, last_notification, channel_message_id, thread_channel_id, thread_message_id, currency, currency_country_code) 
                                  VALUES("${channel_id}", "${title}", "${description}", STR_TO_DATE("${start_date}", "%d/%m/%Y %H:%i:%s"), STR_TO_DATE("${end_date}", "%d/%m/%Y %H:%i:%s"), "${start_price}", "${min_biders}", "${min_bid}", "${cover_image_id}", "${other_images_id}", "${created_by_user}", "${created_by_user_id}", NOW(), "PENDING", NOW(), "${channel_message_id}", "","", "${currency}", "${currency_country_code}")`;
        return this.doInsert(sql);
    }

    setAuctionThread(channel_id:number, channel_message_id:number, thread_channel_id:number, thread_message_id:number): Promise<QueryResult>{
        var sql = `UPDATE Auctions SET thread_message_id = ${thread_message_id}, thread_channel_id = ${thread_channel_id} where channel_id = "${channel_id}" AND channel_message_id = "${channel_message_id}"`;
        return this.doQuery(sql);
    }

    getAuctionsByChannel(channel_id:number):Promise<QueryResult>{
        var sql = `SELECT * FROM Auctions WHERE channel_id = ${channel_id} ORDER BY start_date ASC`;
        return this.doQuery(sql);
    }

    getOpenOrPendingAuctionsByChannel(channel_id:number):Promise<QueryResult>{
        var sql = `SELECT * FROM Auctions WHERE channel_id = ${channel_id} && status IN ("OPEN","PENDING") ORDER BY start_date ASC`;
        return this.doQuery(sql);
    }
    
    getAuctioSummaryByChat(channel_id:number):Promise<QueryResult>{
        var sql = `SELECT *, 
                    COALESCE((SELECT MAX(offer) FROM Offers o WHERE o.channel_id = a.channel_id AND o.channel_sequence = a.channel_sequence), "-") as highest_bid,
                    COALESCE((SELECT user_name FROM Offers o1 WHERE offer = (SELECT MAX(offer) FROM Offers o2 WHERE o2.channel_id = a.channel_id AND o2.channel_sequence = a.channel_sequence) AND o1.channel_id = a.channel_id AND o1.channel_sequence = a.channel_sequence), "-") as highest_bider
                FROM Auctions a WHERE a.channel_id = ${channel_id} ORDER BY a.start_date ASC`;
        return this.doQuery(sql);
    }

    getAuctionBySequence(auction_sequence:number):Promise<SingleQueryResult>{
        var sql = `SELECT * FROM Auctions WHERE channel_sequence = "${auction_sequence}"`;
        return this.doQuery(sql).then((response)=>{
            if(response.results.length === 0) return new Promise((resolve, reject)=>{resolve({result:undefined, fields:response.fields})});
            return new Promise((resolve, reject)=>{resolve({result:response.results[0], fields:response.fields})});
        });
    }

    getAuctionByThread(thread_channel_id:number, thread_message_id:number):Promise<SingleQueryResult>{
        var sql = `SELECT * FROM Auctions WHERE thread_channel_id = "${thread_channel_id}" and thread_message_id = "${thread_message_id}"`;
        return this.doQuery(sql).then((response)=>{
            if(response.results.length === 0) return new Promise((resolve, reject)=>{resolve({result:undefined, fields:response.fields})});
            return new Promise((resolve, reject)=>{resolve({result:response.results[0], fields:response.fields})});
        });
    }
    
    startAuctionById(channel_sequence:number):Promise<QueryResult>{
        var sql = `UPDATE Auctions SET status = "OPEN" WHERE channel_sequence = ${channel_sequence}`;
        return this.doQuery(sql);
    }
    
    endAuctionById(channel_sequence:number):Promise<QueryResult>{
        var sql = `UPDATE Auctions SET status = "ENDED" WHERE channel_sequence = ${channel_sequence}`;
        return this.doQuery(sql);
    }
    
    cancelAuctionById(channel_sequence:number):Promise<QueryResult>{
        var sql = `UPDATE Auctions SET status = "CANCELED" WHERE channel_sequence = ${channel_sequence}`;
        return this.doQuery(sql);
    }
    
    insertBid(channel_id:number, channel_sequence:number, user_id:number, user_name:string, first_name:string, offer:number){
        var sql = `INSERT INTO Offers (channel_id, channel_sequence, user_id, user_name, first_name, offer, date) VALUES("${channel_id}", "${channel_sequence}", "${user_id}", "${user_name}", "${first_name}", ${offer}, NOW())`;
        return this.doQuery(sql);
    }
    
    getAuctionMaxBid(channel_sequence:number):Promise<SingleQueryResult>{
        var sql = `SELECT o.*,n.private_chat_id  FROM Offers o INNER JOIN NotifyList n ON o.user_id = n.user_id WHERE offer = (SELECT MAX(offer) FROM Offers WHERE channel_sequence = ${channel_sequence}) AND channel_sequence = ${channel_sequence}`;
        return this.doQuery(sql).then((response)=>{
            if(response.results.length === 0) return new Promise((resolve, reject)=>{resolve({result:undefined, fields:response.fields})});
            return new Promise((resolve, reject)=>{resolve({result:response.results[0], fields:response.fields})});
        });
    }
    
    getAuctionBiders(channel_id:number, channel_sequence:number):Promise<QueryResult>{
        var sql = `SELECT * FROM Offers WHERE channel_id = ${channel_id} AND channel_sequence = ${channel_sequence} ORDER BY OFFER DESC`;
        return this.doQuery(sql);
    }

    insertIntoNotifyList(auction_sequence:number, user_name:string, user_id:number, first_name:string, private_chat_id:number):Promise<InsertQueryResult>{
        var sql = `INSERT INTO NotifyList (auction_sequence, user_name, user_id, first_name, private_chat_id, date_added) VALUES("${auction_sequence}", "${user_name}", "${user_id}", "${first_name}", "${private_chat_id}", NOW())`;
        return this.doInsert(sql);
    }

    getNotifyList(auction_sequence:number):Promise<QueryResult>{
        var sql = `SELECT * FROM NotifyList WHERE auction_sequence = "${auction_sequence}"`;
        return this.doQuery(sql);
    }

    checkIfUserIsSubscribed(auction_sequence:number, user_name:string):Promise<SingleQueryResult>{
        var sql = `SELECT * FROM NotifyList WHERE auction_sequence = "${auction_sequence}" AND user_name = "${user_name}"`;
        return this.doQuery(sql).then((response)=>{
            if(response.results.length === 0) return new Promise((resolve, reject)=>{resolve({result:undefined, fields:response.fields})});
            return new Promise((resolve, reject)=>{resolve({result:response.results[0], fields:response.fields})});
        });
    }

    getUserOpenAuctions(user_id:number):Promise<QueryResult>{
        var sql = `SELECT * FROM Auctions a INNER JOIN NotifyList n ON a.channel_sequence = n.auction_sequence WHERE n.user_id = "${user_id}" AND a.status = "OPEN"`;
        return this.doQuery(sql);
    }

    getAuctionOtherParticipants(user_id:number, auction_sequence:number):Promise<QueryResult>{
        var sql = `SELECT * FROM NotifyList n WHERE user_id != ${user_id} AND auction_sequence = "${auction_sequence}"`;
        return this.doQuery(sql);
    }
}

export const db = new MSQLDB();