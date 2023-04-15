


async function processRecord( item ) {
    let getOrderPayload = {
        "__name": "orders",
        "company_id": "TMS",
        "stops": [{
            "__name": "stops",
            "company_id": "TMS",
            "city": item.ORIGIN_CITY, 
            "state": item.ORIGIN_ST, 
            "location_id": item.ORIGIN_LOC_ID, 
            "order_sequence": 1
        },
        {
            "__name": "stops",
            "company_id": "TMS",
            "city": item.DESTINATION_CITY,
            "state": item.DESTINATION_ST,
            "location_id": item.DESTINATION_LOC_ID,
            "order_sequence": 2
        }]
    }
    let orderDetails = await getNewOrder(getOrderPayload);

    orderDetails.blnum = item.CONSOL_NBR;
    orderDetails.collection_method = "P";
    orderDetails.customer_id = "MACH1LIN";
    orderDetails.pallets_how_many = item.PACKS;
    orderDetails.pieces = item.PACKS;
    orderDetails.weight = item.CHARGEABLE_WEIGHT;

    orderDetails.stops[0].city = item.ORIGIN_CITY;
    orderDetails.stops[0].state = item.ORIGIN_ST;
    orderDetails.stops[0].location_id = item.ORIGIN_LOC_ID;
    orderDetails.stops[0].order_sequence = 1;
    orderDetails.stops[0].sched_arrive_early = item.ETA;
    orderDetails.stops[0].sched_arrive_late = item.ETA;

    orderDetails.stops[1].city = item.DESTINATION_CITY;
    orderDetails.stops[1].state = item.DESTINATION_ST;
    orderDetails.stops[1].location_id = item.DESTINATION_LOC_ID;
    orderDetails.stops[1].order_sequence = 2;
    orderDetails.stops[1].sched_arrive_early = item.ETA;
    orderDetails.stops[1].sched_arrive_late = item.ETA;

    orderDetails.freightGroup.pro_nbr = item.CONSOL_NBR;
    orderDetails.freightGroup.total_chargeable_weight = item.CHARGEABLE_WEIGHT;
    orderDetails.freightGroup.total_handling_units = item.SHIP_COUNT;
    orderDetails.freightGroup.total_pieces = item.PACKS;
    orderDetails.freightGroup.total_req_spots = item.SHIP_COUNT;
    orderDetails.freightGroup.total_weight = item.CHARGEABLE_WEIGHT;
    orderDetails.freightGroup.weight_uom_type_code = "LBS";

    orderDetails.freightGroup.freightGroupItems[0] = {
        "__type": "freight_group_item",
        "__name": "freightGroupItems",
        "company_id": "TMS",
        "add_timestamp": "20230228151300-0600",
        "add_userid": "lmeadm",
        "fgi_sequence_nbr": 1,
        "handling_units": item.SHIP_COUNT,
        "pieces": item.PACKS,
        "req_spots": item.SHIP_COUNT,
        "weight": item.CHARGEABLE_WEIGHT,
        "weight_uom_type_code": "LBS"
    }
}

async function getNewOrder(bodyPayload) {
    process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;
    let options = {
        uri: process.env.MALEOD_API_ENDPOINT + "new",
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.MALEOD_API_TOKEN}`
        },
        json : bodyPayload
    };
    return new Promise((resolve, reject) => {
        request(options, function (err, data, body) {
            if (err) {
                console.log("Error", err);
                reject(err);
            } else {
                console.log("Get Orders response : ", body );
                resolve(body);
            }
        });
    });
}

async function postNewOrder(bodyPayload) {
    let options = {
        uri: process.env.MALEOD_API_ENDPOINT + "create",
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.MALEOD_API_TOKEN}`
        },
        json : bodyPayload
    };
    return new Promise((resolve, reject) => {
        request(options, function (err, data, body) {
            if (err) {
                console.log("Error", err);
                reject(err);
            } else {
                console.log( body );
                resolve( body )
            }
        });
    });
}