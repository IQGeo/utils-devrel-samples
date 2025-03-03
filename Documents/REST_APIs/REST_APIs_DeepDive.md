# RESTful APIs - Code Deep Dive

## Table of Contents

- [RESTful APIs - Code Deep Dive](#restful-apis---code-deep-dive)
  - [Table of Contents](#table-of-contents)
  - [Tool Description](#tool-description)
  - [Tool files](#tool-files)
  - [How the tool works](#how-the-tool-works)
    - [plaform\_REST\_example.py](#plaform_rest_examplepy)
    - [NMT\_REST\_example.py](#nmt_rest_examplepy)

---

## Tool Description

REST APIs allow developers to build interfaces from other systems to the IQGeo Platform. In the library there are two files: `platform_REST_example.py` and `NMT_REST_example.py`, with examples for the Platform and NMT REST APIs, repectively.

## Tool files

- `plaform_REST_example.py` - REST API example for the Platform application
- `NMT_REST_example.py` - REST API example for the NMT application

All files are located in the `modules/custom/public/js/Samples/customer_connection_JavaScript` folder

## How the tool works

In this section we will go over the tool source code describing how it works.

### plaform_REST_example.py

The code start with the relevant `import` statements. Make sure your Python environment has the libraries installed

```
import requests; 
import json;
```

- The `requests` library is used to send the HTTP requests to the server
- The `json` library is used to read the cookies dictionary and REST request response

Next some variables are created

```
login_url   = 'https://example.com/auth'
select_url  = "https://example.com/select"

session = requests.Session()

uauth = {'user': 'admin','pass': '_mywWorld_',} 
```

- `login_url` and `select_url` are the URLs for the two requests to be sent: Authentication and select, respectively. Make sure to edit the URL to add the address of your development server before continuing
  
- `requests.Session()` is called to ensure cookie persistence. The authentication request will return a cookie that needs to be used in the following requests
- The `uauth` dictionary contain the login and password information to be used in the authentication requests
  - These are the deafult username and password for the `admin` account when the environment was created. Ehsire that this information is correct for your environment
  - For production environments due to security concerns it is not recommended to use username and password engine for authentication. IQGeo provides support to several authentication mechanisms, you can find more information about how to set them up in the Platform documentation under `Installation and Configuration > Configuration > Configuring authentication`

With all information set, the authentication request can be sent

```
response = session.post(login_url, data=uauth)
if response.status_code == 200:
    print(response)
    print()
    cookies = response.cookies.get_dict()
    print(json.dumps(cookies))
    print()
else:
    print("Error:", response2.status_code, response.text)

headers = {
    'Cookie': 'myworldapp=' + cookies['myworldapp'] + '; csrf_token=' + cookies['csrf_token']
}
```

- The process starts by sending a POST request to the authentication URL, passing as `data` the `uauth` dictionary created

- If the HTTP response code is `200` that means that the authentication was successful and then
  - The response code is printed in the Terminal
  - The returned cookies are passed as a Dict to the `cookies` variable and printed in the Terminal
- If the HTTP response code is not `200` that means that there was an issue with the authentication, the `status_code` and `text` are printed for information
- The `headers` dict will contain the relevant cookies to be used in the `select` request

Next the variables containing information for the `select` query are created. 

```
latitude = 52.2087034
longitude = 0.1382864
zoom_level = 8
layer = ["bbc", "mywcom_fc"]

params = {
    "lat": latitude,
    "lon": longitude,
    "zoom": zoom_level,
    "layers": ",".join(layer), 
}
```

You can find more information on the available functions in the Platform documentation in the `Developer Guide > REST API` section. Specifically the `select` request has, as require parameters:

- The Latitude and Longitude where to search for the selected features
  
- The zoom level to use
- A comma-separated list of layer codes to fetch features from
  - To see what Layers are available go to `Configuration -> Layers` and use the `Code` of the layer in this variable
  - In this example the request is for Backbone Circuits and Fiber Cables, the results may vary depending on your development environment database, you can change this variable to see different results for different layers

After setting the `select` request data, it can be sent to the server

```
response2 = requests.get(select_url, params=params, headers=headers)

if response2.status_code == 200:
    data = response2.json()
    print("Fetched features:", data)
else:
    print("Error:", response2.status_code, response.text)
```

- `select` is a GET request, and the parameters are
  - The URL
  - The parameters dict
  - The headers dict

- As with the authentication request if the HTTP response code is `200` that means that the request was successful and then
  - The response code is printed in the Terminal
  - The returned data is printed
- - If the HTTP response code is not `200` that means that there was an issue with the reqiest, the `status_code` and `text` are printed for information

### NMT_REST_example.py

The NMT REST example is very similar to the [Platform REST API](##plaform_REST_example.py) sample. This section will only cover the different logic in the specific NMT sample.

You can find more information on the functions available in the NMT REST API by checking the relevant page in the NMT documentation under `Developer Guide > Developer API > External REST API > Viewing the API specification`

The ony difference between the NMT sample and the [Platform REST API](##plaform_REST_example.py) sample is the address of the request to be sent to the server after the authentication

```
getFeature_url  = 'https://example.com/modules/comms/api/v1/resourceInventoryManagement/resource/fiber_cable/174?name=DROP-140&fields=name%2Cspecification'
```

The base URL for the request is `https://example.com/modules/comms/api/v1/resourceInventoryManagement/resource/fiber_cable`, this request queries NMT for a specific feature type (in the example case, `fiber_cable`), next it is possible to pass additional parameters to the request, in the example the request receives:

- The `id` of a specific object (in the example `174`)

- The `name` of the object
- The `fields` parameter where you can specify which fields you want to be returned (in the example `name` and `specification`)
- Ensure that the parameters that you pass to the request exist in your database. You can also check that features and fields are available in the "Configuration" page, under "Features" 