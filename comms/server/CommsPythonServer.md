# Python API Code

### Getting started

When creating an api call you want to find `comms/server/controllers/routing.py`

The format to ad a new route is `config.add_route(url, controller, functionName)`
- `url: String` <-- Do not include `$` for injecting arguments into the url
- `controller: String` <-- Choose the controller closely associated with your api
- `functionName: String` <-- Function is created inside controller file you choose

```source
i.e.
config.add_route(
    "/modules/comms/structure/{feature_type}/{id}/replace/{new_feature_type}",
    "mywcom_structure_controller",
    "replace_structure"
)
```

All the managers can be found in `comms/server/api`. This is where you can write code associated with a specific manager to seperate from the controller code.

It is highly recommended you write a test to help you debug your code.

## Writing Client tests

Test name format should be `test_name_of_test`

You will exclude the word "test" from the `launch.json` and the `comms_client_test_suite.py` arrays

For example if your test name is:
-  `test_structure_replace`

You will add to the arrays as:
- `structure_replace`


### Client test suite.

When creating this test you want to find `comms_dev_db/tests/client/comms_client_test_suite.py`

You need to add the name of your test to `launch.json` in the clientTest array as well as to the `_test_names` array inside `comms_client_test_suite.py`

These tests use a Selinium type of codebase. It's usually straight forward, but here are a few tips:
- To live debug, click on the VS code debug tool, go to the dropdown and select `Tests: Client in Selinium`
    - Next select `run`
    - Then click the test you just created and added to the arrays
    - Finally open up http://localhost:4444 and go to the `Sessions` tab
        - You should see a test queued and to the very left of the test name you should see a video camera icon
        - Click that to watch your test

Once your test is finished and creating the expected results you will run the command
- `comms_client_tests <test_name> cdiff` this will allow you to see the previous txt file for test results (if there is one), or see the current txt file in a split view with the desired results on the right hand side.

**NOTE: The above command will also allow you to fix existing tests by seeing the output and understand why it might be failing**

Next, if the output looks like the desired output, run the command
- `comms_client_tests accept <test_name>` this will accept the output as the expected result and when you run the test, if it reproduces the expected output, it will be marked as PASSED.

### Server test suite

When creating this test you want to find `comms_dev_db/tests/server/comms_server_test_suite.py`

You need to add the name of your test to `launch.json` in the serverTest array as well as to the `test_names` array inside `comms_server_test_suite.py`

This is where you will create the test using dummy data to run against the api call you wrote  in `comms/server/controllers/routing.py`

- To live debug, click on the VS code debug tool, go to the dropdown and select `Tests: Comms Server Tests`
    - Next select `run`
    - Then click the test name you just created and added to the arrays i.e `structure_replace`

### Connecting your App to your server api
If you want to run your app and see how it behaves agains the api call you wrote:

- To live debug, click on the VS code debug tool, go to the dropdown and select `Python server - attach to apache`

This will not ask you for any further options. To see if your api call is working, go to your comms app and do the behavior on the UI to trigger the API call. i.e. fill out a form and click submit


### Helpful hints

To get output from the db table for something and store in variable
```
tableRecord = self.db_view.table(string) // i.e. self.db_view.table('manhole')
tableRecord.get(id) // i.e. tableRecord.get(6000) will return data for the manhole matching id of 6000
```

To get parameters from url string example:
```
// in routing.py
config.add_route(
    "/modules/comms/structure/{feature_type}/{id}/replace/{new_feature_type}",
    "mywcom_structure_controller",
    "replace_structure"
)

// in mywcom_structure_controller.py

def function_name(self):
    feature_type = self.get_param(self.request, "feature_type", mandatory=True)
    newFeature = self.get_param(self.request, "new_feature_type", mandatory=True)
    id = self.get_param(self.request, "id", mandatory=True)

```

To check if user is authorized
```
self.current_user.assertAuthorized(self.request, feature_type=feature_type, application=app)
```

Error handling example
```
try:
    tableRecord = self.db_view.table(string)
except:
    raise MywError('error_message')
```
