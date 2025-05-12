# Design Rule - Code Deep Dive

## Table of Contents

-   [Design Rule - Code Deep Dive](#design-rule---code-deep-dive)
    -   [Table of Contents](#table-of-contents)
    -   [Tool Description](#tool-description)
    -   [Tool files](#tool-files)
    -   [How the tool works](#how-the-tool-works)
        -   [fiber_count_rule.js](#fiber_count_rulejs)

---

## Tool Description

The Design Rule tool is a native Network Manager Telecom (NMT) tool that allows the user to check if the features in a given Design follow a defined rule.
The NMT Development Database comes with three pre-defined Rules: Conduit Capacity, Pole Spacing, and Specification Set. The files for these rules can be found at `comms_dev_db/public/js/design_rules`. But we have created an extra rule - Fiber Count - and will go over how to set it up. You can use this sample as a basis to create your own Design Rules.

## Tool files

The tool files are:

-   `fiber_count_rule.js` - The file where the Design Rule is configured

All files are located in the `modules/devrel_samples/public/js/Samples/design_rules` folder

## How the tool works

In this section we will go over the tool source code describing how it works.

### fiber_count_rule.js

```
import myw from 'myWorld-client';
import designRule from 'modules/comms/js/validation/designRule';

```

-   `myw` is the client class, we will use it to call the `msg` function and used localised strings for the messages describing the issues (if any) with the features
-   `designRule` is the base class for any Design Rule we create

Next comes the class declaration, static properties initialization, and constructor

```
class fiberCountRule extends designRule {
    static {
        this.prototype.type = 'fiber_count';

        this.prototype.minCount = 24;

        this.prototype.designStates = ['Designing'];
    }

    typeDesc() {
        return myw.app.msg(this.type + '.title');
    }
```

-   The class extends `designRule`. As mentioned before, the `designRule` class is the base class for any Design Rule we create
-   Next, the static properties of the class are initialized
    -   `this.prototype.type` is used as the key when the design rules is registered with the plugin and, optionally, the id for the message string that gives the name of the rule when shown to the user
    -   `this.prototype.minCount` is the parameter that is going to be used when checking Features agains the Design Rule. In this sample case we will check if fiber cables have a fiber count bigger than 24
    -   `this.prototype.designStates`: Is an array where the user can set that the rule will run only on Designs that are in specific state(s). In the example the rule will only check Designs that are in the `Designing` state.
-   The function `typeDesc` returns the string that is shown in the Data Validation window. Here we are using a localised string that is located in the file `utils-devrel-samples/public/locales/utils-devrel-samples.msg`

```
async run() {
    const featureType = 'fiber_cable';
    const features = await this.engine.features(featureType);

    for await (const feature of features) {
        if (this.stop) break;
        await this._validateCount(feature);
    }
}
```

-   `run` is the function that is called when you press the "Start" button in the Data Validation window. It starts by querying the Design for all the features of the given type (in our case `fiber_cable`), then it iterates over the result calling the `_validateCount` function for each of the Features

```
_validateCount(feature) {
    const fiberCount = feature.properties.fiber_count;

    if (fiberCount >= this.minCount) return;
    this.engine.logError(feature, this, myw.app.msg(this.type + '.description'), [
        {
            name: 'description',
            external_name: myw.app.msg(this.type + '.cause'),
            value:
                myw.app.msg(this.type + '.fiber_count_of') +
                ` ${feature.properties.name} ` +
                myw.app.msg(this.type + '.is') +
                ` ${feature.properties.fiber_count} ` +
                myw.app.msg(this.type + '.minimum_is') +
                ` ${this.minCount}`
        }
    ]);
}
```

-   `_validateCount` is the function that actually checks the Feature against the rule. If the Feature breaks the rule (in our case that happens in the `if (fiberCount >= this.minCount)` check), then we call the `logError` function that adds an entry to the list of Features that has broken the rule, including its `name` and `value`
