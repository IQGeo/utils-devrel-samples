# Native Js API

### Add the routing

For comms, navigate to `comms/native/services/controllers/routing.js`

You will add your new api call in the object following this format

```
routing.register(url string, ControllerName, functionName, requestType),
```

The controller you choose should relate to the api call feature being used.

Because this `/native` folder should be as similar to the python code, we use snake case for our function names. i.e. `replace_structure`

The url string should not include `$`, make sure to strip those

```
//Example code
routing.register(
    'modules/comms/structure/{feature_type}/{id}/replace/{new_feature_type}',
    MywcomStructureController,
    'replace_structure',
    'POST'
);
```

From here, you will write your native server code beginning in the targeted controller. In this example `comms/native/services/controllers/MywcomStructureController.js`.

> This code should be as close to the code you wrote for your python server. There will be some differences, but these two codebases need to be as similar as possible.

### Before writing js api tests

Whenever you run the native tests, you need to initialize your SQLlite database first.

run task "Build Extract"

OR

run `build_extract "test"`

#### If you run into `InvalidVersion Error`

List the latest module versions `myw_product list versions`

Output example:

| module              | version |
| ------------------- | ------- |
| core                | 6.4     |
| .devcontainer       | dev     |
| .git                | dev     |
| .vscode             | dev     |
| comms               | dev     |
| comms_dev_db        | dev     |
| custom              | 1       |
| custom-bash-scripts | dev     |
| dev_db              | dev     |
| dev_tools           | 6.4     |
| workflow            | 6.3     |

In this case, dev_tools is not current, visit sharepoint --> click on Releases --> Platform --> find latest DevTools.zip

Extract to project and you should see dev_tools 6.4.new_version

### Writing Js Api Tests

> There is a watch command you should run. In the Terminal dropdown menu click, Run Task, then find and select "Watch Applications Dev". This will watch for changes in your tests and rebuild after each save

In comms_dev_db/tests/js/spec/ there are the .js files where you write the tests. Similar to the comms_server_test_suit.py

> NOTE: For this example we will use comms_dev_db/tests/js/spec/structure_services.js

In structure_services.js you will begin by writing your test function

the first string is the behavior of the api call, are we:

-   Adding
-   Updating
-   Deleting
-   Replacing
-   etc.

The argument of the function is not normally used in our tests, but it is used for generating results when the test is run.

```source
test('Replace', function() {
    // code here
})
```

#### Adding subTests

Much like Jest or Karma or Mocha, our testing framwork uses a command to describe the test, and then sub functions to process tests.

```source
// Jest will use
describe('description of test', function(testName) {
    test('test name, () => {
        // code here
    })
})

// Our test suite uses
test('Replace', function(testName) {
    subTest('test description', async function(subTestName) {
    // code here
    });
})
```

> The argument of the function is not normally used in our tests, but it is used for generating results when the test is run.

If you only have one process you need to test, instead of subTest, use lastSubTest.

-   lastSubTest <-- has functionality for tearing down the test and other cleanup db processees

```source
test('Replace', function(testName) {
    lastSubTest('test description', async function(subTestName) {
    // code here
    });
})
```

> For the remainder of this section, we will use `lastSubTest` as we are only writing one test process

Delta is usually a `String` defining which design is being used to test against. i.e. `'design/NB046'`

You need to set a delta either with

-   `const delta = th.cleanDelta`

Or if you want a specified value

-   `const delta = 'design/NB046';`

and then set it with

-   `th.setDelta(ds, delta)` where ds is the datasource.

The `th.setDelta(ds, delta)` can be found in `commsTestHelper.js`

> Many important functions are in commsTestHelper.js such as `outPut()` and `showDatabaseChanges()`. It's important to familiarize yourself with this file.

Setting delta needs to be done inside the subtest function

```source
test('Replace', function(testName) {
    const delta = 'design/NB046';
    lastSubTest('test description', async function(subTestName) {
        th.setDelta(ds, delta);
        // code here
    });
})
```

#### Connecting your test to your js api call

> In the python side, you will use the url of the api call in the test itself.

> With the JS API tests, You will use `ds.comms.apiFunctionName()` to target the api call you wrote in commsDsApi.js

```source
// In commsDsApi.js our api call function name is replaceStructure()

test('Replace', function(testName) {
    const delta = 'design/NB046';
    const data = { // <---Data that we need for this api call
        feature: {
            type: 'Feature',
            properties: {
                installation_date: '2022-09-14',
                specification: 'FPM-CCANN-MCX',
                labor_costs: 'hole_dig',
                size_x: 850,
                size_y: 1300,
                size_z: 900
            },
            geometry: {
                type: 'Point',
                coordinates: [0.13589194633448995, 52.22403156535742],
                world_name: 'geo',
                world_type: 'geo'
            }
        }
    };
    lastSubTest('test description', async function(subTestName) {
        th.setDelta(ds, delta, true);
        const results = await ds.comms.replaceStructure(data, 'cabinet', 1, 'manhole');
        // code here
    });
})
```

#### Running tests

Before you can run your test you need to add it to the launch.json

In Launch.json find `jsAPItests`, add to options array the appropriate filename_testname.

-   i.e. `Structure_Services_Replace`

To debug the test live, you can go to the debug option in vs code, and select:

-   `Test: Comms Js API Native (Debug)`

From the command line you can use

`comms_js_api_tests comms_dev_db run Structure_Services_Replace cdiff`

-   comms_js_api_tests <-- type of test you're running
-   comms_dev_db <-- location of test file
-   run <-- to run the test. NOTE: accept is used in place of run to accept the test results
-   Structure_Services_Replace <-- test filename i.e. structure_services.js with name of test i.e. replace
-   cdiff <-- see the difference / output of test

Whenever you `accept` the test, it outputs the results to the /results folder as a .txt file
