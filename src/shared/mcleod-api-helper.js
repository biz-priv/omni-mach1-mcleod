const request = require('request');

const token = process.env.MALEOD_API_TOKEN;
const headers = {
    "Accept": "application/json",
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`,
    "verify": "False",
};

async function getNewOrder(bodyPayload) {
    process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;
    let options = {
        uri: process.env.MALEOD_API_ENDPOINT + "orders/new",
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
                resolve({ statusCode : data.statusCode, body });
            }
        });
    });
}

async function getOrderById( orderId ) {
    process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;
    let options = {
        uri: process.env.MALEOD_API_ENDPOINT + `orders/${orderId}`,
        method: 'GET',
        headers: {
            'Accept' : 'application/json',
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.MALEOD_API_TOKEN}`
        }
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

async function postNewOrder(bodyPayload) {
    process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;
    let options = {
        uri: process.env.MALEOD_API_ENDPOINT + "orders/create",
        method: 'PUT',
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
                resolve({ statusCode : data.statusCode, body });
            }
        });
    });
}

async function updateOrder(bodyPayload) {
    process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;
    let options = {
        uri: process.env.MALEOD_API_ENDPOINT + "orders/update",
        method: 'PUT',
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
                resolve({ statusCode : data.statusCode, body });
            }
        });
    });
}

async function getOrders() {
    process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;

    //TODO - SSM
    var uri =
        `${process.env.MALEOD_API_ENDPOINT}orders/search?orders.status=A&shipper.location_id==%7Cconsignee.location_id==&recordLength=1000`;

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

async function getZipcode(zipcode) {
    process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;

    var uri = `${process.env.MALEOD_API_ENDPOINT}reg_x_zip/search?fd_zipcode=${zipcode}`
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

async function getRegion(reg_uid) {
    process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;

    var uri = `${process.env.MALEOD_API_ENDPOINT}reg_x_loc/search?reg_uid=${reg_uid}`
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

// async function update_order(bodyPayload) {
//     process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;

//     //TODO - SSM
//     var uri = `${process.env.MALEOD_API_ENDPOINT}orders/update`
//     let options = {
//       uri,
//       method: "PUT",
//       headers,
//       json : bodyPayload
//     };

//     return new Promise((resolve, reject) => {
//         request(options, function (err, data, body) {
//             if (err) {
//                 console.log("Error", err);
//                 reject(err);
//             } else {
//                 resolve({ statusCode: data.statusCode, body });
//             }
//         });
//     });
// }

module.exports = {
    getNewOrder,
    getOrderById,
    postNewOrder,
    updateOrder,
    getOrders,
    getZipcode,
    getRegion
};