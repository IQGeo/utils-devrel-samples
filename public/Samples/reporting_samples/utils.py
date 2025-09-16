#! /bin/env python3

import requests
from pathlib import Path


BASE_URL = "http://host.docker.internal"
LOGIN_URL = f"{BASE_URL}/auth"
SESSION = requests.Session()
HEADERS = {}


# Authentication helpers
def iqgeo_jwt_auth(token_file: Path):
    """
    Prompt user for JWT token and then set the auth header.
    """
    # TODO: use argparse to pass token file path
    if not token_file.exists():
        raise FileNotFoundError(f"Token file not found: {token_file}")

    token = token_file.read_text().strip()
    response = SESSION.post(LOGIN_URL, data={"id_token": token})
    response.raise_for_status()
    return response.cookies.get_dict()


def iqgeo_interactive_ropc_auth():
    """
    Prompt user for credentials and then send AUTH request.
    Raises exception if not authorized, returns the auth cookie on success.
    """
    user = input("Enter username: ")
    password = input("Enter password: ")

    uauth = {"user": user, "pass": password}

    response = SESSION.post(LOGIN_URL, data=uauth)
    response.raise_for_status()
    return response.cookies.get_dict()


def iqgeo_get_request(endpoint, design):
    """
    Hit a GET endpoint using the auth cookie for this session.

    Raises HTTP errors, and returns the request body JSON.
    """
    params = {"design": design}
    r = SESSION.get(endpoint, headers=HEADERS, params=params)
    r.raise_for_status()
    return r.json()



def iqgeo_post_request(endpoint, design):
    """
    Hit a POST endpoint using the auth cookie for this session.

    Raises HTTP errors, and returns the request body JSON.
    """
    params = {"design": design}
    r = SESSION.post(endpoint, headers=HEADERS, params=params)
    r.raise_for_status()
    return r.json()

def set_auth_cookies(cookies: dict):
    HEADERS["cookie"] = (
        f"myworldapp={cookies['myworldapp']}; csrf_token={cookies['csrf_token']}"
    )
