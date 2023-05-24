const request = require('request');

const api_key = process.env.GOOGLE_API_TOKEN;

async function getLatLng(address) {
    let options = {
        uri: `https://maps.googleapis.com/maps/api/geocode/json?address=${address}&key=${api_key}`,
        method: 'GET'
    };
    console.log("Google api uri - ", options.uri);
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

async function getZipCode(lat, lng) {
    let options = {
        uri: `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&sensor=false&key=${api_key}`,
        method: 'GET'
    };
    console.log("Google api uri - ", options.uri);
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

async function getZipcodeFromGoogle(address) {
    let zipcode = null;
    
    try {
        let result = await getLatLng(address);
        let body = JSON.parse(result.body)
    
        if ( body.results.length > 0 ) {
            let lat = body.results[0].geometry.location.lat;
            let lng = body.results[0].geometry.location.lng;
    
            result = await getZipCode(lat, lng);
            body = JSON.parse(result.body)
        
            if ( body.results.length > 0 ) {
                for (let index = 0; index < body.results[0].address_components.length; index++) {
                    const element = body.results[0].address_components[index];
                    if (element.types.includes("postal_code")) {
                        zipcode = element.short_name;
                        break;
                    }
                }
            }
        } 
    } catch (error) {
        console.log("Error in google api : ", error);
    }

    return zipcode;
}

module.exports = {
    getZipcodeFromGoogle
};