/**
 * Takes in a bunch of parameters, gets the checked boxed and assignes them to
 * the correct parent. Then runs the validation on each checked category.
 * @param {object} ds - The datasource.
 * @param {boolean} inWindow - Run validation in just window.
 * @param {object} app - myw.app object.
 * @param {array<context>} contexts - The contexts of the categories to be validated.
 * @param {array} imageContext - The image context object.
 * @param {function} setImageContext - This is a function that will update the imageContext object.
 * @param {string} modalType - The type of modal to display.
 * @param {object} maxWarningsContext - The maximum number of warnings to display. Example: {{ maxWarnings: 100, validatedWarnings: 0 }}
 * @param {function} setMaxWarningsContext - This is a function that sets the maxWarningsContext state.
 * @param {function} stopValidation - A function that if returns true will stop the validation.
 * @param {function} setStopping - A function that sets the stopping variable.
 * @param {function} setStopped - A function that sets the stopped variable.
 * @returns An array of issues.
 */
export const run = async (
    ds,
    inWindow,
    app,
    contexts,
    imageContext,
    setImageContext,
    modalType,
    maxWarningsContext,
    setMaxWarningsContext,
    stopValidation,
    setStopping,
    setStopped
) => {
    let issues;
    const checkedCategories = _selectedCategories(contexts, imageContext);
    const assignedCategories = _setCategoryToParentName(checkedCategories);

    issues = await validateCategories(
        ds,
        inWindow,
        app,
        assignedCategories,
        setImageContext,
        modalType,
        maxWarningsContext,
        setMaxWarningsContext,
        stopValidation,
        setStopping,
        setStopped
    );
    return issues;
};

/**
 * It validates the categories and items in the categories. Sets the errors
 * in the contexts.
 * @param {object} ds - The datasource.
 * @param {boolean} inWindow - Run validation in just window.
 * @param {object} app - myw.app object.
 * @param {object} categories - An object with keys that are the category names and values that are arrays of
 * items.
 * @param {function} setImageContext - A function that sets the state of the image context.
 * @param {string} modalType - The type of modal that is being validated.
 * @param {object} maxWarningsContext - The maximum number of warnings to display.
 * @param {function} setMaxWarningsContext - A function that sets the maxWarningsContext state.
 * @param {function} stopValidation - A function that returns true when the user clicks the stop button.
 * @param {function} setStopping - A function that sets the state of the stopping variable.
 * @param {function} setStopped - A function that sets the stopped state to true.
 */
const validateCategories = async (
    ds,
    inWindow,
    app,
    categories,
    setImageContext,
    modalType,
    maxWarningsContext,
    setMaxWarningsContext,
    stopValidation,
    setStopping,
    setStopped
) => {
    _resetImageContext(setImageContext);
    _resetMaxWarningsContext(setMaxWarningsContext);
    let exceededMaxWarnings = false;
    let totalErrors = [];
    for (let categoryName in categories) {
        if (exceededMaxWarnings) continue;
        _setContextValidation(setImageContext, categoryName, 'validating');

        let categoryErrors = [];
        for (const item of categories[categoryName]) {
            if (exceededMaxWarnings || categoryName === item.name) continue;
            _setContextValidation(setImageContext, item.name, 'validating');

            const categoryMaxWarnings =
                maxWarningsContext.maxWarnings - (categoryErrors.length + totalErrors);
            // eslint-disable-next-line no-await-in-loop
            const itemErrors = await getItemErrors(
                item,
                ds,
                app,
                inWindow,
                modalType,
                categoryMaxWarnings
            );

            handleErrorsInContext(item.name, itemErrors, setImageContext);
            categoryErrors.push(...itemErrors);

            if (totalErrors.length + categoryErrors.length >= maxWarningsContext.maxWarnings)
                exceededMaxWarnings = true;
            if (
                stop(
                    app,
                    stopValidation,
                    setStopping,
                    setStopped,
                    setMaxWarningsContext,
                    setImageContext,
                    categoryName,
                    categoryErrors,
                    totalErrors
                )
            ) {
                return;
            }
        }
        handleErrorsInContext(categoryName, categoryErrors, setImageContext);
        totalErrors.push(...categoryErrors);
    }
    app.setCurrentFeatureSet(totalErrors);
    shouldFireEvent(modalType, app, totalErrors.length);
    setMaxWarningsContext(prevState => {
        return {
            maxWarnings: prevState.maxWarnings,
            validatedWarnings: totalErrors.length
        };
    });
};

/**
 * Checks if modalType is equal to 'checkDesignReadOnly', if true, fires event.
 * @param {string} modalType - string of modal type
 * @param {object} app - myw.app object
 * @param {number} totalErrorsLength - number of total validation errors
 */
const shouldFireEvent = async (modalType, app, totalErrorsLength) => {
    if (modalType === 'checkDesignReadOnly') {
        await app.plugins['validation'].setValidationWarnings(totalErrorsLength);
        app.fire('save_delta_state_change');
    }
};

/**
 * Will handle the stopping of the validation.
 * @param {string} categoryName - The name of the category being validated.
 * @param {integer} categoryErrors - The errors that were found in the category
 * @param {integer} totalErrors - The total number of errors across all categories.
 * @returns {boolean} - true or false to break out of method which calls stop.
 */
const stop = (
    app,
    stopValidation,
    setStopping,
    setStopped,
    setMaxWarningsContext,
    setImageContext,
    categoryName,
    categoryErrors,
    totalErrors
) => {
    if (!stopValidation()) {
        return false;
    }
    setStopping(false);
    setStopped(true);
    handleErrorsInContext(categoryName, categoryErrors, setImageContext);
    app.setCurrentFeatureSet([...totalErrors, ...categoryErrors]);
    setMaxWarningsContext(prevState => {
        return {
            maxWarnings: prevState.maxWarnings,
            validatedWarnings: [...totalErrors, ...categoryErrors].length
        };
    });
    return true;
};

/**
 * Sets the errors to the image context based on the category name.
 * @param {string} itemName - The name of the item to be validated.
 * @param {integer} itemErrors - An array of errors.
 * @param {function} setImageContext - the setImageContext function from the useState hook
 */
const handleErrorsInContext = (itemName, itemErrors, setImageContext) => {
    const validateState = itemErrors.length > 0 ? 'error' : 'success';
    _setContextValidation(setImageContext, itemName, validateState, itemErrors.length);
};

/**
 * Gets the errors for that category and returns it.
 * @param {object} item - Item from the ImageContext.
 * @param {object} ds - The data source.
 * @param {object} app - The app object.
 * @param {boolean} inWindow - Run validation only in window or not.
 * @param {string} modalType - Type of modal
 * @param {integer} categoryMaxWarnings - The maximum number of warnings that can be displayed for a modal.
 * @returns Number of errors.
 */
const getItemErrors = async (item, ds, app, inWindow, modalType, categoryMaxWarnings) => {
    if (item.parent == 'Design') {
        return _validateDesignCheckboxes(app, inWindow, item.name, modalType, categoryMaxWarnings);
    }
    return _validateCategory(ds, inWindow, app, item.name, modalType, categoryMaxWarnings);
};

/**
 * _selectedCategories() takes an array of contexts and an image context and returns an array of the
 * checked categories.
 * @param {array<context>} contexts - The contexts for the checkboxes.
 * @param {array} imageContext - The context which stores the image information.
 * for the checkboxes.
 * @returns An array of the checked categories.
 */
const _selectedCategories = (contexts, imageContext) => {
    const contextItems = _spreadContexts(contexts);
    return _getCheckedCategories(imageContext, contextItems);
};

/**
 * It takes an array of arrays of contexts and spreads the items
 * into a single array.
 * @param {array<context>} contexts - The contexts for the checkboxes.
 * @returns An array of context items.
 */
const _spreadContexts = contexts => {
    let contextItems = [];
    contexts.map(context => {
        if (!context[0].data) {
            return;
        }
        contextItems.push(...context[0].items);
    });
    return contextItems;
};

/**
 * It takes an array of image objects and an array of context items, and returns an array of image
 * objects that have a matching name and are checked
 * @param {array} imageContext - The context which stores the image information.
 * @param {array} contextItems - The context items returned from speadContext()
 * @returns An array of objects.
 */
const _getCheckedCategories = (imageContext, contextItems) => {
    let categories = [];
    imageContext.map(image => {
        contextItems.map(item => {
            if (item.name !== image.name) return;
            if (!item.checked) return;
            categories.push(image);
        });
    });
    return categories;
};

/**
 * Takes each category and assignes it to its parent checkbox
 * @param {array} categories - All categorties to be assigned to their parent.
 * @returns An object with the parent category as the key and the child categories as the value.
 */
const _setCategoryToParentName = categories => {
    let items = {};
    for (const index in categories) {
        const item = categories[index];
        if (!item.parent) continue;
        if (!items[item.parent]) items[item.parent] = [];
        items[item.parent].push(item);
    }
    return items;
};

/**
 * It resets the validation state of all the items in the image context.
 * @param {function} setContext - Function to set the context.
 */
const _resetImageContext = setContext => {
    setContext(prevState => {
        for (const index in prevState) {
            prevState[index].validated = '';
            prevState[index].numWarnings = 0;
        }
        return [...prevState];
    });
};

/**
 * Sets the number of maxWarning in the context to 0.
 * @param {function} setContext - Function to set the context.
 */
const _resetMaxWarningsContext = setContext => {
    setContext(prevState => {
        return {
            maxWarnings: prevState.maxWarnings,
            validatedWarnings: 0
        };
    });
};

/**
 * Sets the validaiton state of the object in the image context, this ensures
 * that the correct validation image is rendered.
 * @param {funtion} setContext - the setContext function from the useContext hook
 * @param {string} categoryName - The name of the category to validate.
 * @param {string} validateState - "" || "validating" || "success" || "error"
 * @param {integer} numWarnings - Number of warnings that cannot be exceeded in the modal.
 */
const _setContextValidation = (setContext, categoryName, validateState, numWarnings = 0) => {
    setContext(prevState => {
        for (const stateIndex in prevState) {
            if (prevState[stateIndex].name !== categoryName) continue;
            prevState[stateIndex].validated = validateState;
            prevState[stateIndex].numWarnings = numWarnings;
            return [...prevState];
        }
    });
};

/**
 * Run the backend validation on a category. Will run different validation if modal is
 * checkDesign as that will only run on the delta.
 * @param {object} ds - The datasource.
 * @param {boolean} inWindow - Run validation in just window.
 * @param {object} app - myw.app object.
 * @param {string} category - Name of the category to be validated.
 * @param {string} modalType - Name of the modal being validated.
 * @param {integer} maxWarnings - Number of warnings that cannot be exceeded.
 * @returns Number of errors for that category.
 */
const _validateCategory = async (ds, inWindow, app, category, modalType, maxWarnings) => {
    const bounds = inWindow ? app.map.getBounds() : null;
    let categoryErrorItems;

    if (modalType === 'checkDesign' || modalType === 'checkDesignReadOnly') {
        categoryErrorItems = await _validateDelta(ds, bounds, category, maxWarnings);
    } else {
        categoryErrorItems = await ds.comms.validateArea(bounds, [category]);
    }

    if (maxWarnings && categoryErrorItems.length >= maxWarnings) {
        // More errors than maximum... so return correct number of errors
        categoryErrorItems = categoryErrorItems.slice(0, maxWarnings);
        return categoryErrorItems;
    }
    return categoryErrorItems;
};

/**
 * It validates the delta, and returns the error items
 * @param {object} ds - The datasource.
 * @param {array} bounds - The latlng bounds of the area to validate.
 * @param {string} category - Name of the category to be validated.
 * @param {integer} maxWarnings - Number of warnings that cannot be exceeded.
 * @returns An array of error items.
 */
const _validateDelta = async (ds, bounds, category, maxWarnings) => {
    let categoryErrorItems;
    // in delta check for conflicts first
    categoryErrorItems = await ds.comms.conflicts(ds.delta, bounds, [category], maxWarnings);

    // then check data integrity
    const integrityErrorItems = await ds.comms.validateDelta(
        ds.delta,
        bounds,
        [category],
        maxWarnings
    );

    categoryErrorItems = categoryErrorItems.concat(integrityErrorItems);

    // Cannot return two features with the same URN as causes problems with feature reps.
    // Conflicts are more important so remove matching integrity errors
    // ENH: Core to fix problem with displaying duplicate reps or combine integrity and conflict
    const filteredErrorItems = {};
    categoryErrorItems.forEach(errorItem => {
        // Duplicate - check new error is conflict before inserting
        if (errorItem.getUrn() in filteredErrorItems) {
            if (errorItem.validationFeatureType == 'conflictFeature') {
                filteredErrorItems[errorItem.getUrn()] = errorItem;
                return;
            }
        } else {
            filteredErrorItems[errorItem.getUrn()] = errorItem;
        }
    });

    categoryErrorItems = Object.values(filteredErrorItems);
    return categoryErrorItems;
};

/**
 * Takes a design rule and validates it.
 * @param {object} app - myw.app object.
 * @param {boolean} inWindow - Run validation in just window.
 * @param {string} rule - The rule to validate
 * @param {string} modalType - Name of the modal being validated.
 * @param {integer} maxWarnings - Number of warnings that cannot be exceeded.
 * @returns An array of errors.
 */
const _validateDesignCheckboxes = async (app, inWindow, rule, modalType, maxWarnings = null) => {
    const bounds = inWindow ? app.map.getBounds() : null;
    let deltaOnly = false;
    if (modalType === 'checkDesign' || modalType === 'checkDesignReadOnly') {
        deltaOnly = true;
    }

    const _designRuleEngine = await app.plugins.designRulesManager.validationEngine([rule], {
        maxErrors: maxWarnings,
        deltaOnly: deltaOnly,
        bounds: bounds
    });
    await _designRuleEngine.run();
    const errors = _designRuleEngine.errors;

    return errors;
};
