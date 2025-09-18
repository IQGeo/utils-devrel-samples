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
    if not token_file.exists():
        raise FileNotFoundError(f"Token file not found: {token_file}")

    token = token_file.read_text().strip()
    response = SESSION.post(LOGIN_URL, data={"id_token": token})
    response.raise_for_status()
    cookies = response.cookies.get_dict()
    HEADERS[
        "cookie"
    ] = f"myworldapp={cookies['myworldapp']}; csrf_token={cookies['csrf_token']}"


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
    cookies = response.cookies.get_dict()
    HEADERS[
        "cookie"
    ] = f"myworldapp={cookies['myworldapp']}; csrf_token={cookies['csrf_token']}"


def get_all_features(feature_type, design=None):
    """Get all features of a specific type in the design"""
    return iqgeo_get_request(f"{BASE_URL}/feature/{feature_type}", design).get(
        "features", []
    )


def iqgeo_get_request(endpoint, design=None):
    """
    Hit a GET endpoint using the auth cookie for this session.

    Raises HTTP errors, and returns the request body JSON.
    """
    params = {"design": design} if design is not None else None
    r = SESSION.get(endpoint, headers=HEADERS, params=params)
    r.raise_for_status()
    return r.json()


def iqgeo_post_request(endpoint, design=None, data=None):
    """
    Hit a POST endpoint using the auth cookie for this session.

    Raises HTTP errors, and returns the request body JSON.
    """
    params = {"design": design} if design is not None else None
    r = SESSION.post(endpoint, headers=HEADERS, params=params, data=data)
    r.raise_for_status()
    return r.json()


def set_auth_cookies(cookies: dict):
    HEADERS[
        "cookie"
    ] = f"myworldapp={cookies['myworldapp']}; csrf_token={cookies['csrf_token']}"
