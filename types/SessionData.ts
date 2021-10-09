interface SessionData{
    step: "idle"|"finale"|"channelId"|"title"|"description"|"startDate"|"endDate"|"startPrice"|"minPlayers"|"minBid"|"coverImageId"|"otherImagesId"|"B_auction"|"B_bidValue"|"currency"|"cancelAuctionSelectChannel"|"cancelAuctionSelectAuction"|"cancelAuctionConfirm"|"modifyAuctionBeforePublish",
    insertAuction:{
        channelId?:number,
        title?:string,
        description?:string,
        startDate?:Date,
        endDate?:Date,
        startPrice?:number
        minPlayers?:number,
        minBid?:number
        coverImageId?:string,
        otherImagesId?:string[]
        currencyCountryCode?:string,
        currency?:string
    },
    insertAuctionTempChange?:boolean,
    cancelAuction:{
        channel?:any,
        auction?:any
    }
    channelIdMapping?:Map<string, string>,
    auctionIdMapping?:Map<string, string>,
    registered?:boolean,
    B_auction?:any,
    B_bidValue?:number,
}

export{SessionData};