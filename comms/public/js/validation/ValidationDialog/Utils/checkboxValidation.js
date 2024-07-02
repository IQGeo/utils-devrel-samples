import React from 'react';

/**
 * Checks the the image context against the name and renders the validation image depending.
 * @param {array} imageContext - This is the array of objects that contains the validation
 * @param {string} checkboxName - the name of the checkbox
 * @returns Returns the image that should be rendered for a specific checkbox.
 */
export const renderValidationImg = (imageContext, checkboxName) => {
    const itemIndex = imageContext.findIndex(item => item.name === checkboxName);
    if (itemIndex < 0) return null;
    switch (imageContext[itemIndex].validated) {
        case '':
            return <img src="" className="checkbox__img" />;
        case 'success':
            return (
                <img
                    src="modules/comms/images/editor/check-circle-outlined.svg"
                    className="checkbox__img"
                />
            );
        case 'error':
            return (
                <>
                    <img
                        src="modules/comms/images/editor/close-circle-outlined.svg"
                        className="checkbox__img"
                    />
                    <div className="checkbox__warnings">{imageContext[itemIndex].numWarnings}</div>
                </>
            );
        case 'validating':
            return <img src="modules/comms/images/searching.gif" className="checkbox__img" />;
        default:
            break;
    }
};

/**
 * Updates the status of an individual checkbox.
 * @param {string} checkboxName - The name of the checkbox that was clicked
 * @param {boolean} checkboxValue - the value of the checkbox
 * @param {array} desiredContext - the context you want to update
 * @param {function} setDesiredContext - This is the setter function for the desired context.
 */
export const updateIndividualCheckbox = (
    checkboxName,
    checkboxValue,
    desiredContext,
    setDesiredContext
) => {
    const newContext = [...desiredContext[0].items];
    const desiredContextBox = desiredContext[0].items.findIndex(item => item.name === checkboxName);
    newContext[desiredContextBox].checked = checkboxValue;
    setDesiredContext(prevContext => [
        {
            data: prevContext[0].data,
            items: newContext
        }
    ]);
};

/**
 * It takes in a checkbox value and a setDesiredContext function, and then it updates the desired
 * context with the checkbox value.
 * @param {boolean} checkboxValue - The value of the checkbox that was clicked.
 * @param {function} setDesiredContext - This is the function that will be used to update the state of the parent
 * component.
 */
export const updateParentCheckbox = (checkboxValue, setDesiredContext) => {
    setDesiredContext(prevContext => [
        {
            data: checkboxValue,
            items: [...prevContext[0].items]
        }
    ]);
};
