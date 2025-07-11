import requests
import json

login_url   = 'http://localhost/auth'
select_url  = "http://localhost/select"


session = requests.Session()

user = input("Enter username: ")
password = input("Enter password: ")

uauth = {"user": user, "pass": password}

response = session.post(login_url, data=uauth)
if response.status_code == 200:
    print(response)
    print()
    cookies = response.cookies.get_dict()
    print(json.dumps(cookies))
    print()
else:
    print("Error:", response2.status_code, response.text)

headers = {'cookie': 'myworldapp=' + cookies['myworldapp'] + '; csrf_token=' + cookies['csrf_token']}

latitude = 52.2244
longitude = 0.14002
zoom_level = 10
layer = ["mywcom_st", "dlts"]

params = {
    "lat": latitude,
    "lon": longitude,
    "zoom": zoom_level,
    "layers": ",".join(layer), 
}
        
response2 = requests.get(select_url, params=params, headers=headers)

if response2.status_code == 200:
    data = response2.json()
    print("fetched features:", data)
else:
    print("error:", response2.status_code, response.text)