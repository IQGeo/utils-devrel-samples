import React, { useContext, useEffect, useRef, useState } from 'react';
import myw from 'myWorld-client';
import { ModalContext } from '../ModalContextProvider/ModalContextProvider';
import { run } from '../Utils/checkboxRunValidation';
import Input from '../Input/Input';

/**
 * Returns a form that contains the validation rows,
 * design rules list, additional rows, and buttons
 * @component
 * @param {{
 *  ds: datasource,
 *  inWindow: boolean,
 *  app: myw.app,
 *  label: string,
 *  validationRows: JSX.Element,
 *  designRulesList: JSX.Element,
 *  additionalRows: JSX.Element,
 *  readOnly: boolean,
 *  primaryBtnText: string,
 *  secondaryBtnText: string,
 *  numberInputLabel: string,
 *  modalType: string,
 *  modalContainerName: string,
 *  handleVisible: function
 * }}
 * @returns  A function that returns a component.
 */
const DraggableModalContent = ({
    ds,
    inWindow,
    app,
    label,
    validationRows,
    designRulesList,
    additionalRows,
    readOnly,
    primaryBtnText,
    secondaryBtnText,
    numberInputLabel,
    modalType,
    modalContainerName,
    handleVisible
}) => {
    const {
        context,
        designRulesContext,
        imageContext,
        setImageContext,
        inWindowContext,
        maxWarningsContext,
        setMaxWarningsContext
    } = useContext(ModalContext);
    const [busy, setBusy] = useState(false);
    const [ranCDRO, setRanCDRO] = useState(false);
    const [stopping, setStopping] = useState(false);
    const [stopped, setStopped] = useState(false);
    const [secondaryButtonIsDisabled, setSecondaryButtonIsDisabled] = useState(true);

    const startButton = useRef();
    const stopRef = useRef();

    // For use when check design opens automatically when design state is changed.
    useEffect(() => {
        switch (true) {
            case ranCDRO:
                break;
            case !context[0]?.items || context[0].items.length === 0:
                break;
            case !designRulesContext[0]?.items || designRulesContext[0].items.length === 0:
                break;
            case imageContext.length === 0:
                break;
            case modalType !== 'checkDesignReadOnly':
                break;
            default:
                setRanCDRO(true);
                handleSubmit(modalType, '');
                break;
        }
    }, [imageContext]);

    useEffect(() => {
        setSecondaryButtonIsDisabled(!busy);
    }, [busy]);

    useEffect(() => {
        if (modalType === 'changesFilter') {
            setSecondaryButtonIsDisabled(false);
            return;
        }
    }, []);

    useEffect(() => {
        stopRef.current = stopping;
    }, [stopping]);

    /**
     * If the modal type is changesFilter and the start button value is start, get the filtered
     * changes. Otherwise, run the validation
     * @param {string} modalType - This is the type of modal that is being submitted.
     * @param {object} startButton - This is the button element object that is clicked to submit the form.
     */
    const handleSubmit = (modalType, startButton) => {
        setStopped(false);
        if (modalType === 'changesFilter' && startButton === 'start') {
            getFilteredChanges(designRulesContext, myw);
            return;
        }
        runValidation();
    };

    /**
     * It returns a boolean value that is true if the stopRef.current value is true, and false if the
     * stopRef.current value is false
     * @returns The current value of the stopRef.
     */
    const stopValidation = () => {
        return stopRef.current;
    };

    /**
     * It runs the validation
     */
    const runValidation = async () => {
        setBusy(true);
        await run(
            ds,
            modalType === 'checkDesign' ? inWindowContext : inWindow,
            app,
            [context, designRulesContext],
            imageContext,
            setImageContext,
            modalType,
            maxWarningsContext,
            setMaxWarningsContext,
            stopValidation,
            setStopping,
            setStopped
        );
        setBusy(false);
    };

    /**
     * If the modal type is changesFilter, then make the modal container visible. Otherwise, set the
     * stopping state to true
     * @param {string} modalType - the type of modal to be displayed
     * @param {string} modalContainerName - The name of the modal container.
     */
    const handleStop = (modalType, modalContainerName) => {
        if (modalType === 'changesFilter') {
            handleVisible(modalContainerName);
            return;
        }
        setStopping(true);
    };

    /**
     * It takes an array of objects, and returns an array of strings
     * @param {array} contextArray - array that contains the data for the checkboxes.
     * @returns An array of the checked categories.
     */
    const getCategories = contextArray => {
        return contextArray[0].items.map(item => {
            if (item.checked) {
                return item.name;
            }
            return;
        });
    };

    /**
     * It gets the categories from the context, gets the bounds from the map or the current feature,
     * and then calls the changesFiltered function of the workflow plugin
     * @param {array} designRulesContextArray - The array of objects containing design rules context.
     * @param {object} mywObject - myw from myWorld-client
     * @returns the filtered changes.
     */
    const getFilteredChanges = (designRulesContextArray, mywObject) => {
        let categories = getCategories(context);
        let bounds = null;
        let bounds_poly = null;

        if (designRulesContextArray[0].items[0].checked) {
            bounds = mywObject.app.map.getBounds();
        } else if (
            designRulesContextArray[0].items[1].checked &&
            mywObject.app.currentFeature !== null
        ) {
            bounds_poly = mywObject.app.currentFeature.geometry;
        } else if (designRulesContextArray[0].items[1].checked && !mywObject.app.currentFeature) {
            mywObject.app.plugins.workflow.showNoElementsMsg();
            return;
        }

        categories = categories.filter(item => item !== undefined);

        mywObject.app.plugins.workflow.changesFiltered(
            categories,
            bounds,
            maxWarningsContext.maxWarnings,
            bounds_poly
        );
    };

    /**
     * It takes a value, and then sets the maxWarningsContext to the value passed in
     * @param {number} value - number to set in input for limit or max warnings
     */
    const setInputWarnings = value => {
        setMaxWarningsContext(prevState => {
            return {
                maxWarnings: value,
                validatedWarnings: prevState.validatedWarnings
            };
        });
    };

    /**
     * It returns an Input component
     * @param {boolean} readOnly - boolean
     * @param {object} maxWarningsContextObject - This is the context object that holds the maxWarnings value.
     * @param {string} numberInputLabel - The label for the input field
     * @returns A function that returns a component.
     */
    const createWarningRows = (readOnly, maxWarningsContextObject, numberInputLabel) => {
        return (
            <Input
                name="Warnings"
                disabled={readOnly}
                inputType="number"
                inputClassName={`maxWarnings ${
                    modalType === 'changesFilter' ? 'limit-input-style' : ''
                }`}
                value={maxWarningsContextObject.maxWarnings}
                setValue={value => setInputWarnings(value)}
                numberInputLabel={numberInputLabel}
            />
        );
    };

    /**
     * It returns a string of HTML that renders a status message in the footer of the modal
     * @param {object} maxWarningsContextObject - This is a context object of maxWarningsContext
     * @returns string of HTML.
     */
    const showFooter = maxWarningsContextObject => {
        let modalStatus;
        if (stopping) {
            modalStatus = renderModalStatus('Stopping');
        } else if (stopped) {
            modalStatus = modalStatus = renderModalStatus(
                `Stopped: ${maxWarningsContextObject.validatedWarnings} warnings found`
            );
        } else if (maxWarningsContextObject.validatedWarnings !== 0) {
            modalStatus = renderModalStatus(
                `${maxWarningsContextObject.validatedWarnings} warnings found`
            );
        } else {
            modalStatus = null;
        }
        return modalStatus;
    };

    /**
     * Returns a span element with the string as the content.
     * @param {string} content - desired content
     * @returns a span element with the string as the content.
     */
    const renderModalStatus = content => {
        return <span className="found-warnings">{content}</span>;
    };

    /**
     * Renders buttons for modal. Start button is conditional
     * @returns array of button components
     */
    const renderButtons = () => {
        return (
            <>
                {modalType === 'checkDesignReadOnly' ? null : (
                    <button
                        className="primary-btn ui-button ui-corner-all ui-widget font-size-normal"
                        type="submit"
                        value="start"
                        ref={startButton}
                        disabled={busy}
                    >
                        {primaryBtnText}
                    </button>
                )}
                <button
                    className="primary-btn ui-button ui-corner-all ui-widget font-size-normal"
                    type="button"
                    value="cancel"
                    onClick={() => handleStop(modalType, modalContainerName)}
                    disabled={secondaryButtonIsDisabled}
                >
                    {secondaryBtnText}
                </button>
            </>
        );
    };

    return (
        <form
            className="draggable-modal-form"
            onSubmit={e => {
                e.preventDefault();
                handleSubmit(modalType, startButton.current.value);
            }}
        >
            <label className="form-label">{label}</label>
            {validationRows}
            {designRulesList}
            {additionalRows}
            <div className="ui-label-input-side-by-side">
                {createWarningRows(readOnly, maxWarningsContext, numberInputLabel)}
            </div>
            {showFooter(maxWarningsContext)}
            <div className="draggable-modal_button-container">{renderButtons()}</div>
        </form>
    );
};

export default DraggableModalContent;
