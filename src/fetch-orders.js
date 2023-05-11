const request = require('request');

module.exports.handler = async (event, context) => {
    console.log("EVENT:", event);
    
    //TODO - SSM

    let getOrdersResponse = await getOrders();

    if ( getOrdersResponse.statusCode < 200 || getOrdersResponse.statusCode >= 300 ) {
        console.log( `Error`, getOrdersResponse.body );
        return promiseResponse;   
    }
    
    let orders = getOrdersResponse.body;
    console.log( orders.length );

    return orders;
}

async function getOrders() {
    // process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;
    
    //TODO - SSM
    var uri = 'https://lme.uat-mcleod.omnilogistics.com:5690/ws/orders/search?orders.status=A&shipper.location_id==%7Cconsignee.location_id==&recordLength=1000';
    var token = '5fad851f-ae7f-476b-bfb9-514840162a14';

    var headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'verify': 'False'
    };

    let options = {
        uri,
        method: 'GET',
        headers
    };
    return new Promise((resolve, reject) => {
        request(options, function (err, data, body) {
            if (err) {
                console.log("Error", err);
                reject(err);
            } else {
                resolve({ statusCode : data.statusCode, body });
            }
        });
    });
}

function getOrders1() {
    // warnings.filterwarnings("ignore");


    fetch(url, { headers: headers, method: 'GET', mode: 'cors' })
        .then(response => response.json())
        .then(output => {
            for (var y = 0; y < output.length; y++) {
                try {
                    var order_id = output[y]['id'];
                    var length = output[y]['stops'].length;
                    var pickup_stop_id = output[y]['stops'][0]['location_id'];
                    for (var w = 0; w < output[y]['stops'].length; w++) {
                        if (output[y]['stops'][w]['order_sequence'] === 6) {
                            var del_stop_id = output[y]['stops'][w]['location_id'];
                        } else {
                            // pass
                        }
                    }
                    // del_stop_id = output[y]['stops'][length-1]['location_id'];
                    // console.log(`${pickup_stop_id} --- ${del_stop_id}`);

                    if (pickup_stop_id === '' || del_stop_id === '') {
                        console.log(`Attempting to update ${order_id}, 6 stops`);
                        // update_order_six_stops(output[y]);
                    } else {
                        // pass
                        // console.log(`No need to update ${order_id}`);
                    }
                } catch (error) {
                    if (output[y]['stops'].length === 6) {
                        console.log(`Attempting to update ${order_id}, 6 stops`);
                        // update_order_six_stops(output[y]);
                    } else if (output[y]['stops'].length === 4) {
                        console.log(`Attempting to update ${order_id}, 4 stops`);
                        // update_order_four_stops(output[y]);
                    } else {
                        console.log(`${order_id} is malformed`);
                    }
                }
            }
        })
        .catch(error => console.error(error));

    // return;
    // if len(output) == 1000:
    //     offset_url = 'https://lme.uat-mcleod.omnilogistics.com:5690/ws/orders/search?orders.status=A&recordLength=1000&recordOffset=1000'
    //     offset_response = requests.get(url, headers=headers, verify=False)
    //     offset_output = output_response.json()
    // else:
    //     pass
}
