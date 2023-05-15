const request = require("request");

const token = "bf2e0b10-7227-4a13-82a4-2b610587ef2d";
const headers = {
    "Accept": "application/json",
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`,
    "verify": "False",
};
const loop_count = 2;

module.exports.handler = async (event, context) => {
  console.log("EVENT:", event);

  try {
    let orders = [];
    let getOrdersResponse = await getOrders();

    if (
      getOrdersResponse.statusCode < 200 ||
      getOrdersResponse.statusCode >= 300
    ) {
      console.log(`Error`, getOrdersResponse.body);
      return orders;
    }

    orders = JSON.parse(getOrdersResponse.body);
    console.log("Orders Length - ", orders.length);

    for (var y = 0; y < loop_count && y < orders.length ; y++) {
        console.log(orders[y]);
        var order_id = orders[y].id;
        var length = orders[y].stops.length;
        
        var pickup_stop_id = orders[y].stops[0].location_id;
        var del_stop_id = orders[y].stops[length-1].location_id;

        if ( (!pickup_stop_id || !del_stop_id) && length >= 4 ) {
            if ( length == 6 ) {
                console.log(`Attempting to update ${order_id}, 6 stops`);
                await update_order_six_stops(orders[y]);
            } else {
                console.log(`Attempting to update ${order_id}, 4 stops`);
                await update_order_four_stops(orders[y]);
            }
        } else {
          console.log(`No need to update ${order_id}`);
        }
    }

    if (orders.length - loop_count > 0) {
        return { hasMoreData: "true" };
    } else {
        return { hasMoreData: "false" };
    }
  } catch (e) {
    console.log(e);
  }

  return {hasMoreData : "false"};
};

async function getOrders() {
    process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;

    //TODO - SSM
    var uri =
        "https://lme.uat-mcleod.omnilogistics.com:5690/ws/orders/search?orders.status=A&shipper.location_id==%7Cconsignee.location_id==&recordLength=1000";

    let options = {
        uri,
        method: "GET",
        headers,
    };
    return new Promise((resolve, reject) => {
        request(options, function (err, data, body) {
        if (err) {
            console.log("Error", err);
            reject(err);
        } else {
            resolve({ statusCode: data.statusCode, body });
        }
        });
    });
}

async function update_order_six_stops(order) {
    let pickup_stops = order.stops.slice(0,3);
    let delivery_stops = order.stops.slice(3,6);


    console.log("pickup_stops", pickup_stops);
    pickup_stops = await update_stops(pickup_stops);
    console.log("pickup_stops", pickup_stops);
    
    delivery_stops = await update_stops(delivery_stops.reverse());

    let update_payload = {
        __name: "orders",
        __type: "orders",
        company_id: "TMS",
        id: order.id,
        stops: [...pickup_stops, ...delivery_stops.reverse()]
    }
    console.log("update_payload", update_payload);

    let update_stops_response = await update_order(update_payload);
    
    if ( update_stops_response.statusCode < 200 || update_stops_response.statusCode >= 300) {
        console.log(`Error updating ${order.id}`, update_stops_response.body);
    } else {
        console.log(`Success updating ${order.id}`);
    }
}

async function update_order_four_stops(order) {
    let pickup_stops = order.stops.slice(0,1);
    let delivery_stops = order.stops.slice(2,3);

    pickup_stops = await update_stops(pickup_stops);
    delivery_stops = await update_stops(delivery_stops.reverse());

    let update_payload = {
        __name: "orders",
        __type: "orders",
        company_id: "TMS",
        id: order.id,
        stops: [...pickup_stops, ...delivery_stops.reverse()]
    }
    console.log("update_payload", update_payload);

    let update_stops_response = await update_order(update_payload);
    
    if ( update_stops_response.statusCode < 200 || update_stops_response.statusCode >= 300) {
        console.log(`Error updating ${order.id}`, update_stops_response.body);
    } else {
        console.log(`Success updating ${order.id}`);
    }
}

async function update_stops( stops ) {
    
    let updated_stops = [];
    updated_stops = stops.map( item => { return {
        __type: "stop",
        __name: "stops",
        company_id: "TMS",
        id: item.id,
        order_sequence: item.order_sequence
    }});

    let location_id = stops[0].location_id; 
    
    if ( !location_id ) {
        let {address, city_name, state, zip_code, location_name} = stops[0];
        if ( !location_name ) {
            location_name = city_name;
        }

        let zipcode_response = await get_zipcode(zip_code);

        if ( zipcode_response.statusCode < 200 || zipcode_response.statusCode >= 300) {
            console.log(`Error`, zipcode_response.body);
            return updated_stops
        }

        let zipcodes = JSON.parse( zipcode_response.body );
        for (let index = 0; index < zipcodes.length; index++) {
            const element = zipcodes[index];
            if ( element.rxz_type_code == 'OPER' ) {
                let reg_uid = element.reg_uid_row.reg_uid;

                let get_location_response = await get_location(reg_uid);

                if ( get_location_response.statusCode < 200 || get_location_response.statusCode >= 300) {
                    console.log(`Error`, get_location_response.body);
                    return updated_stops
                }

                let locations = JSON.parse(get_location_response.body);

                for (let index2 = 0; index2 < locations.length; index2++) {
                    const element1 = locations[index2];
                    if ( element1.location_id[0] == "O") {
                        location_id = element1.location_id;
                    }
                }
            }
        }

        updated_stops[0] = {
            ...updated_stops[0],
            showas_address: address,
            showas_address2: `${city_name} ${state} ${zip_code}`,
            showas_location_name: location_name
        }
    }

    if ( location_id ) {
        updated_stops = updated_stops.map( item => { return {
            ...item,
            location_id
        }});
    }

    return updated_stops;
}

async function get_zipcode(zipcode) {
    process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;

    //TODO - SSM
    var uri = `https://lme.uat-mcleod.omnilogistics.com:5690/ws/reg_x_zip/search?fd_zipcode=${zipcode}`
    let options = {
      uri,
      method: "GET",
      headers,
    };

    return new Promise((resolve, reject) => {
        request(options, function (err, data, body) {
            if (err) {
                console.log("Error", err);
                reject(err);
            } else {
                resolve({ statusCode: data.statusCode, body });
            }
        });
    });
}

async function get_location(reg_uid) {
    process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;

    //TODO - SSM
    var uri = `https://lme.uat-mcleod.omnilogistics.com:5690/ws/reg_x_loc/search?reg_uid=${reg_uid}`
    let options = {
      uri,
      method: "GET",
      headers,
    };

    return new Promise((resolve, reject) => {
        request(options, function (err, data, body) {
            if (err) {
                console.log("Error", err);
                reject(err);
            } else {
                resolve({ statusCode: data.statusCode, body });
            }
        });
    });
}

async function update_order(bodyPayload) {
    process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;

    //TODO - SSM
    var uri = `https://lme.uat-mcleod.omnilogistics.com:5690/ws/orders/update`
    let options = {
      uri,
      method: "PUT",
      headers,
      json : bodyPayload
    };

    return new Promise((resolve, reject) => {
        request(options, function (err, data, body) {
            if (err) {
                console.log("Error", err);
                reject(err);
            } else {
                resolve({ statusCode: data.statusCode, body });
            }
        });
    });
}