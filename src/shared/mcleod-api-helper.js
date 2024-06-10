/*
* File: src\shared\dynamodb.js
* Project: Omni-mach1-mcleod
* Author: Bizcloud Experts
* Date: 2023-08-02
* Confidential and Proprietary
*/
const request = require('request');
const axios = require('axios');

const auth = {
    username : process.env.MALEOD_API_USERNAME,
    password : process.env.MALEOD_API_PASSWORD,
}
const bearer_token = `Bearer ${process.env.MALEOD_API_TOKEN}`;
const headers = {
    "Accept": "application/json",
    "Content-Type": "application/json",
    'Authorization': bearer_token
};

async function getNewOrder(bodyPayload) {
    process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;
    let options = {
        uri: process.env.MALEOD_API_ENDPOINT + "orders/new",
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': bearer_token
        },
        json : bodyPayload,
        // auth
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
            'Authorization': bearer_token
        },
        // auth
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
            'Authorization': bearer_token
        },
        json : bodyPayload,
        // auth
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
            'Authorization': bearer_token
        },
        json : bodyPayload,
        // auth
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

async function getOrdersWithoutShipper() {
    process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;

    var uri =
        `${process.env.MALEOD_API_ENDPOINT}orders/search?shipper.location_id==&recordLength=1000`;

    let options = {
        uri,
        method: "GET",
        headers,
        // auth
    };
    console.log("options", options);
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

async function getOrdersWithoutConsignee() {
    process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;

    var uri =
        `${process.env.MALEOD_API_ENDPOINT}orders/search?consignee.location_id==&recordLength=1000`;

    let options = {
        uri,
        method: "GET",
        headers,
        // auth
    };
    console.log("options", options);
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
    //   auth
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
    //   auth
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

module.exports = {
    getNewOrder,
    getOrderById,
    postNewOrder,
    updateOrder,
    getOrdersWithoutConsignee,
    getOrdersWithoutShipper,
    getZipcode,
    getRegion
};