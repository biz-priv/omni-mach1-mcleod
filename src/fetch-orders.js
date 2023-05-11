const request = require("request");

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
    console.log(orders.length);

    for (var y = 0; y < orders.length; y++) {
      try {
        console.log(orders[y]);
        var order_id = orders[y]["id"];
        var length = orders[y]["stops"].length;
        var pickup_stop_id = orders[y]["stops"][0]["location_id"];

        for (var w = 0; w < orders[y]["stops"].length; w++) {
          if (orders[y]["stops"][w]["order_sequence"] === 6) {
            var del_stop_id = orders[y]["stops"][w]["location_id"];
          } else {
            // pass
          }
        }
        // del_stop_id = orders[y]['stops'][length-1]['location_id'];
        // console.log(`${pickup_stop_id} --- ${del_stop_id}`);

        if (pickup_stop_id === "" || del_stop_id === "") {
          console.log(`Attempting to update ${order_id}, 6 stops`);
          await update_order_six_stops(orders[y]);
        } else {
          // pass
          console.log(`No need to update ${order_id}`);
        }
      } catch (error) {
        console.log(error);
        if (orders[y]["stops"].length === 6) {
          console.log(`Attempting to update ${order_id}, 6 stops`);
          await update_order_six_stops(orders[y]);
        } else if (orders[y]["stops"].length === 4) {
          console.log(`Attempting to update ${order_id}, 4 stops`);
          await update_order_four_stops(orders[y]);
        } else {
          console.log(`${order_id} is malformed`);
        }
      }
    }
  } catch (e) {
    console.log(e);
  }

  return { finished: "true" };
};

async function getOrders() {
  process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;

  //TODO - SSM
  var uri =
    "https://lme.uat-mcleod.omnilogistics.com:5690/ws/orders/search?orders.status=A&shipper.location_id==%7Cconsignee.location_id==&recordLength=1000";
  var token = "5fad851f-ae7f-476b-bfb9-514840162a14";

  var headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    verify: "False",
  };

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

async function update_order_six_stops(orderData) {
  // Suppress warnings
  warnings.filterwarnings("ignore");

  const token = "5fad851f-ae7f-476b-bfb9-514840162a14";

  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    verify: "False",
  };

  const order_id = orderData["id"];
  const length = orderData["stops"].length;

  let stop_one_id, stop_two_id, stop_three_id, del_stop_id, new_pick_loc_code;
  let stop_one, stop_two, stop_three;

  try {
    let pickupStopId = orderData["stops"][0]["location_id"];

    for (let m = 0; m < orderData["stops"].length; m++) {
      const sequence = orderData["stops"][m]["order_sequence"];

      if (sequence === 1) {
        stop_one_id = orderData["stops"][m]["id"];
      } else if (sequence === 2) {
        stop_two_id = orderData["stops"][m]["id"];
      } else if (sequence === 3) {
        stop_three_id = orderData["stops"][m]["id"];
      }
    }

    stop_one = {
      __type: "stop",
      __name: "stops",
      company_id: "TMS",
      id: `${stop_one_id}`,
      order_sequence: 1,
      location_id: `${pickupStopId}`,
    };

    stop_two = {
      __type: "stop",
      __name: "stops",
      company_id: "TMS",
      id: `${stop_two_id}`,
      order_sequence: 2,
      location_id: `${pickupStopId}`,
    };

    stop_three = {
      __type: "stop",
      __name: "stops",
      company_id: "TMS",
      id: `${stop_three_id}`,
      order_sequence: 3,
      location_id: `${pickupStopId}`,
    };
  } catch {
    let address, city, state, zipcode, locationName;

    for (let m = 0; m < orderData["stops"].length; m++) {
      const sequence = orderData["stops"][m]["order_sequence"];

      if (sequence === 1) {
        stop_one_id = orderData["stops"][m]["id"];
        address = orderData["stops"][m]["address"];
        city = orderData["stops"][m]["city_name"];
        state = orderData["stops"][m]["state"];
        zipcode = orderData["stops"][m]["zip_code"];

        try {
          locationName = orderData["stops"][m]["location_name"];
        } catch {
          locationName = city;
        }
      } else if (sequence === 2) {
        stop_two_id = orderData["stops"][m]["id"];
      } else if (sequence === 3) {
        stop_three_id = orderData["stops"][m]["id"];
      }
    }

    const zipLookupUrl = `https://lmeuat:5690/ws/reg_x_zip/search?fd_zipcode=${zipcode}`;
    const zipLookupResponse = requests.get(
      zipLookupUrl,
      headers,
      (verify = false)
    );
    const zip_output = zipLookupResponse.json();

    if (zip_output !== null) {
      for (let j = 0; j < zip_output.length; j++) {
        if (zip_output[j]["rxz_type_code"] === "OPER") {
          const new_loc_code = zip_output[j]["reg_uid_row"]["parent_reg_name"];
          const reg_uid = zip_output[j]["reg_uid_row"]["reg_uid"];

          const loc_url = `https://lmeuat:5690/ws/reg_x_loc/search?reg_uid=${reg_uid}`;
          const loc_response = await fetch(loc_url, { headers: headers });
          const loc_output = await loc_response.json();

          for (let x = 0; x < loc_output.length; x++) {
            if (loc_output[x]["location_id"][0] === "O") {
              new_pick_loc_code = loc_output[x]["location_id"];
            } else {
              continue;
            }
          }
        } else {
          continue;
        }
      }

      stop_one = {
        __type: "stop",
        __name: "stops",
        company_id: "TMS",
        id: `${stop_one_id}`, // need to get stop id
        order_sequence: 1,
        location_id: `${new_pick_loc_code}`, // determine location id
        showas_address: `${address}`,
        showas_address2: `${city}, ${state}, ${zipcode}`,
        showas_location_name: `${location_name}`,
      };
      stop_two = {
        __type: "stop",
        __name: "stops",
        company_id: "TMS",
        id: `${stop_two_id}`, // need to get stop id
        order_sequence: 2,
        location_id: `${new_pick_loc_code}`, // determine location id
      };
      stop_three = {
        __type: "stop",
        __name: "stops",
        company_id: "TMS",
        id: `${stop_three_id}`, // need to get stop id
        order_sequence: 3,
        location_id: `${new_pick_loc_code}`, // determine location id
      };
    } else {
      stop_one = {
        __type: "stop",
        __name: "stops",
        company_id: "TMS",
        id: `${stop_one_id}`, // need to get stop id
        order_sequence: 1,
      };
      stop_two = {
        __type: "stop",
        __name: "stops",
        company_id: "TMS",
        id: `${stop_two_id}`, // need to get stop id
        order_sequence: 2,
      };
      stop_three = {
        __type: "stop",
        __name: "stops",
        company_id: "TMS",
        id: `${stop_three_id}`, // need to get stop id
        order_sequence: 3,
      };
    }
  }

  let stop_four_id, stop_five_id, stop_six_id;
  let stop_four, stop_five, stop_six;

  try {
    for (let m = 0; m < orderData["stops"].length; m++) {
      if (orderData["stops"][m]["order_sequence"] === 4) {
        stop_four_id = orderData["stops"][m]["id"];
      } else if (orderData["stops"][m]["order_sequence"] === 5) {
        stop_five_id = orderData["stops"][m]["id"];
      } else if (orderData["stops"][m]["order_sequence"] === 6) {
        stop_six_id = orderData["stops"][m]["id"];
        del_stop_id = orderData["stops"][m]["location_id"];
      }
    }

    stop_four = {
      __type: "stop",
      __name: "stops",
      company_id: "TMS",
      id: `${stop_four_id}`, // need to get stop id
      order_sequence: 4,
      location_id: `${del_stop_id}`, // determine location id
    };

    stop_five = {
      __type: "stop",
      __name: "stops",
      company_id: "TMS",
      id: `${stop_five_id}`, // need to get stop id
      order_sequence: 5,
      location_id: `${del_stop_id}`, // determine location id
    };

    stop_six = {
      __type: "stop",
      __name: "stops",
      company_id: "TMS",
      id: `${stop_six_id}`, // need to get stop id
      order_sequence: 6,
      location_id: `${del_stop_id}`, // determine location id
    };
  } catch (e) {
    let address, city, state, zipcode, location_name;
    let new_del_loc_code;

    for (let m = 0; m < orderData["stops"].length; m++) {
      if (orderData["stops"][m]["order_sequence"] === 4) {
        stop_four_id = orderData["stops"][m]["id"];
      } else if (orderData["stops"][m]["order_sequence"] === 5) {
        stop_five_id = orderData["stops"][m]["id"];
      } else if (orderData["stops"][m]["order_sequence"] === 6) {
        stop_six_id = orderData["stops"][m]["id"];
        address = orderData["stops"][m]["address"];
        city = orderData["stops"][m]["city_name"];
        state = orderData["stops"][m]["state"];
        zipcode = orderData["stops"][m]["zip_code"];
        try {
          location_name = orderData["stops"][m]["location_name"];
        } catch {
          location_name = city;
        }
      }
    }

    const zip_lookup_url = `https://lmeuat:5690/ws/reg_x_zip/search?fd_zipcode=${zipcode}`;
    const zip_lookup_response = await fetch(zip_lookup_url, {
      headers,
      verify: false,
    });
    const zip_output = await zip_lookup_response.json();

    if (zip_output != null) {
      for (let j = 0; j < zip_output.length; j++) {
        if (zip_output[j]["rxz_type_code"] === "OPER") {
          new_del_loc_code = zip_output[j]["reg_uid_row"]["parent_reg_name"];
          const reg_uid = zip_output[j]["reg_uid_row"]["reg_uid"];

          const loc_url = `https://lmeuat:5690/ws/reg_x_loc/search?reg_uid=${reg_uid}`;
          const loc_response = await fetch(loc_url, { headers, verify: false });
          const loc_output = await loc_response.json();

          for (let x = 0; x < loc_output.length; x++) {
            if (loc_output[x]["location_id"][0] === "O") {
              new_del_loc_code = loc_output[x]["location_id"];
            } else {
              // Handle the else case if needed
            }
          }
        } else {
          // Handle the else case if needed
        }
      }

      stop_four = {
        __type: "stop",
        __name: "stops",
        company_id: "TMS",
        id: `${stop_four_id}`, // need to get stop id
        order_sequence: 4,
        location_id: `${new_del_loc_code}`, // determine location id
      };

      stop_five = {
        __type: "stop",
        __name: "stops",
        company_id: "TMS",
        id: `${stop_five_id}`, // need to get stop id
        order_sequence: 5,
        location_id: `${new_del_loc_code}`, // determine location id
      };

      stop_six = {
        __type: "stop",
        __name: "stops",
        company_id: "TMS",
        id: `${stop_six_id}`, // need to get stop id
        order_sequence: 6,
        location_id: `${new_del_loc_code}`, // determine location id
        showas_address: `${address}`,
        showas_address2: `${city}, ${state}, ${zipcode}`,
        showas_location_name: `${location_name}`,
      };
    } else {
      stop_four = {
        __type: "stop",
        __name: "stops",
        company_id: "TMS",
        id: `${stop_four_id}`, // need to get stop id
        order_sequence: 4,
        location_id: `${del_stop_id}`,
      };
      stop_five = {
        __type: "stop",
        __name: "stops",
        company_id: "TMS",
        id: `${stop_five_id}`, // need to get stop id
        order_sequence: 5,
        location_id: `${del_stop_id}`,
      };
      stop_six = {
        __type: "stop",
        __name: "stops",
        company_id: "TMS",
        id: `${stop_six_id}`, // need to get stop id
        order_sequence: 6,
        location_id: `${del_stop_id}`,
      };
    }

    const updated_payload = {
      __name: "orders",
      __type: "orders",
      company_id: "TMS",
      id: `${order_id}`,
      stops: [stop_one, stop_two, stop_three, stop_four, stop_five, stop_six],
    };

    const updated_payload_json = JSON.stringify(updated_payload);
    console.log(updated_payload_json);

    const update_url = "https://lmeuat.na.addsomni.com:5690/ws/orders/update";
    const update_response = await fetch(update_url, {
      method: "PUT",
      headers,
      body: updated_payload_json,
      verify: false,
    });

    if (update_response.status >= 200 && update_response.status < 300) {
      console.log(`Success! Updated ${order_id}`);
    } else {
      console.log(`Error updating ${order_id}`);
      console.log(await update_response.text());
    }
  }
}

async function update_order_four_stops(orderData) {
  // Suppress warnings
  warnings.filterwarnings("ignore");

  const token = "5fad851f-ae7f-476b-bfb9-514840162a14";

  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    verify: "False",
  };

  const order_id = orderData["id"];
  const length = orderData["stops"].length;

  let stop_one_id, stop_two_id, del_stop_id;
  let stop_one, stop_two;

  try {
    let pickupStopId = orderData["stops"][0]["location_id"];

    for (let m = 0; m < orderData["stops"].length; m++) {
      const sequence = orderData["stops"][m]["order_sequence"];

      if (sequence === 1) {
        stop_one_id = orderData["stops"][m]["id"];
      } else if (sequence === 2) {
        stop_two_id = orderData["stops"][m]["id"];
      }
    }

    stop_one = {
      __type: "stop",
      __name: "stops",
      company_id: "TMS",
      id: `${stop_one_id}`,
      order_sequence: 1,
      location_id: `${pickupStopId}`,
    };

    stop_two = {
      __type: "stop",
      __name: "stops",
      company_id: "TMS",
      id: `${stop_two_id}`,
      order_sequence: 2,
      location_id: `${pickupStopId}`,
    };
  } catch {
    let address, city, state, zipcode, locationName;

    for (let m = 0; m < orderData["stops"].length; m++) {
      const sequence = orderData["stops"][m]["order_sequence"];

      if (sequence === 1) {
        stop_one_id = orderData["stops"][m]["id"];
        address = orderData["stops"][m]["address"];
        city = orderData["stops"][m]["city_name"];
        state = orderData["stops"][m]["state"];
        zipcode = orderData["stops"][m]["zip_code"];

        try {
          locationName = orderData["stops"][m]["location_name"];
        } catch {
          locationName = city;
        }
      } else if (sequence === 2) {
        stop_two_id = orderData["stops"][m]["id"];
      }
    }

    const zipLookupUrl = `https://lmeuat:5690/ws/reg_x_zip/search?fd_zipcode=${zipcode}`;
    const zipLookupResponse = requests.get(
      zipLookupUrl,
      headers,
      (verify = false)
    );
    const zip_output = zipLookupResponse.json();

    if (zip_output !== null) {
      for (let j = 0; j < zip_output.length; j++) {
        if (zip_output[j]["rxz_type_code"] === "OPER") {
          const new_loc_code = zip_output[j]["reg_uid_row"]["parent_reg_name"];
          const reg_uid = zip_output[j]["reg_uid_row"]["reg_uid"];

          const loc_url = `https://lmeuat:5690/ws/reg_x_loc/search?reg_uid=${reg_uid}`;
          const loc_response = await fetch(loc_url, { headers: headers });
          const loc_output = await loc_response.json();

          for (let x = 0; x < loc_output.length; x++) {
            if (loc_output[x]["location_id"][0] === "O") {
              new_pick_loc_code = loc_output[x]["location_id"];
            } else {
              continue;
            }
          }
        } else {
          continue;
        }
      }

      stop_one = {
        __type: "stop",
        __name: "stops",
        company_id: "TMS",
        id: `${stop_one_id}`, // need to get stop id
        order_sequence: 1,
        location_id: `${new_pick_loc_code}`, // determine location id
        showas_address: `${address}`,
        showas_address2: `${city}, ${state}, ${zipcode}`,
        showas_location_name: `${location_name}`,
      };
      stop_two = {
        __type: "stop",
        __name: "stops",
        company_id: "TMS",
        id: `${stop_two_id}`, // need to get stop id
        order_sequence: 2,
        location_id: `${new_pick_loc_code}`, // determine location id
      };
    } else {
      stop_one = {
        __type: "stop",
        __name: "stops",
        company_id: "TMS",
        id: `${stop_one_id}`, // need to get stop id
        order_sequence: 1,
      };
      stop_two = {
        __type: "stop",
        __name: "stops",
        company_id: "TMS",
        id: `${stop_two_id}`, // need to get stop id
        order_sequence: 2,
      };
    }
  }

  let stop_three_id, stop_four_id;
  let stop_three, stop_four;

  try {
    for (let m = 0; m < orderData["stops"].length; m++) {
      if (orderData["stops"][m]["order_sequence"] === 3) {
        stop_three_id = orderData["stops"][m]["id"];
      } else if (orderData["stops"][m]["order_sequence"] === 4) {
        stop_four_id = orderData["stops"][m]["id"];
        del_stop_id = orderData["stops"][m]["location_id"];
      }
    }

    stop_three = {
      __type: "stop",
      __name: "stops",
      company_id: "TMS",
      id: `${stop_three_id}`, // need to get stop id
      order_sequence: 3,
      location_id: `${del_stop_id}`, // determine location id
    };

    stop_four = {
      __type: "stop",
      __name: "stops",
      company_id: "TMS",
      id: `${stop_four_id}`, // need to get stop id
      order_sequence: 4,
      location_id: `${del_stop_id}`, // determine location id
    };
  } catch (e) {
    let address, city, state, zipcode, location_name;
    let new_del_loc_code;

    for (let m = 0; m < orderData["stops"].length; m++) {
      if (orderData["stops"][m]["order_sequence"] === 3) {
        stop_three_id = orderData["stops"][m]["id"];
      } else if (orderData["stops"][m]["order_sequence"] === 4) {
        stop_four_id = orderData["stops"][m]["id"];
        address = orderData["stops"][m]["address"];
        city = orderData["stops"][m]["city_name"];
        state = orderData["stops"][m]["state"];
        zipcode = orderData["stops"][m]["zip_code"];
        try {
          location_name = orderData["stops"][m]["location_name"];
        } catch {
          location_name = city;
        }
      }
    }

    const zip_lookup_url = `https://lmeuat:5690/ws/reg_x_zip/search?fd_zipcode=${zipcode}`;
    const zip_lookup_response = await fetch(zip_lookup_url, {
      headers,
      verify: false,
    });
    const zip_output = await zip_lookup_response.json();

    if (zip_output != null) {
      for (let j = 0; j < zip_output.length; j++) {
        if (zip_output[j]["rxz_type_code"] === "OPER") {
          new_del_loc_code = zip_output[j]["reg_uid_row"]["parent_reg_name"];
          const reg_uid = zip_output[j]["reg_uid_row"]["reg_uid"];

          const loc_url = `https://lmeuat:5690/ws/reg_x_loc/search?reg_uid=${reg_uid}`;
          const loc_response = await fetch(loc_url, { headers, verify: false });
          const loc_output = await loc_response.json();

          for (let x = 0; x < loc_output.length; x++) {
            if (loc_output[x]["location_id"][0] === "O") {
              new_del_loc_code = loc_output[x]["location_id"];
            } else {
              // Handle the else case if needed
            }
          }
        } else {
          // Handle the else case if needed
        }
      }

      stop_three = {
        __type: "stop",
        __name: "stops",
        company_id: "TMS",
        id: `${stop_three_id}`, // need to get stop id
        order_sequence: 3,
        location_id: `${new_del_loc_code}`, // determine location id
      };

      stop_four = {
        __type: "stop",
        __name: "stops",
        company_id: "TMS",
        id: `${stop_four_id}`, // need to get stop id
        order_sequence: 4,
        location_id: `${new_del_loc_code}`, // determine location id
        showas_address: `${address}`,
        showas_address2: `${city}, ${state}, ${zipcode}`,
        showas_location_name: `${location_name}`,
      };
    } else {
      stop_three = {
        __type: "stop",
        __name: "stops",
        company_id: "TMS",
        id: `${stop_three_id}`, // need to get stop id
        order_sequence: 3,
      };
      stop_four = {
        __type: "stop",
        __name: "stops",
        company_id: "TMS",
        id: `${stop_four_id}`, // need to get stop id
        order_sequence: 4,
      };
    }

    const updated_payload = {
      __name: "orders",
      __type: "orders",
      company_id: "TMS",
      id: `${order_id}`,
      stops: [stop_one, stop_two, stop_three, stop_four],
    };

    const updated_payload_json = JSON.stringify(updated_payload);
    console.log(updated_payload_json);

    const update_url = "https://lmeuat.na.addsomni.com:5690/ws/orders/update";
    const update_response = await fetch(update_url, {
      method: "PUT",
      headers,
      body: updated_payload_json,
      verify: false,
    });

    if (update_response.status >= 200 && update_response.status < 300) {
      console.log(`Success! Updated ${order_id}`);
    } else {
      console.log(`Error updating ${order_id}`);
      console.log(await update_response.text());
    }
  }
}
