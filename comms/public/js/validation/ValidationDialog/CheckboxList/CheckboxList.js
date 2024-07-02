import React, { useContext, useEffect, useRef, useState } from 'react';
import Checkbox from './Checkbox';
import './CheckboxList.scss';
import { renderValidationImg } from '../Utils/checkboxValidation';
import { ModalContext } from '../ModalContextProvider/ModalContextProvider';

/**
 * It takes in an array of objects that contain the name and label of the checkbox, an array that
 * contains the data for the checkboxes, and returns an array of checkboxes
 * @component
 * @param {{
 * itemDefs: array,
 * readOnly: boolean,
 * onCheckboxChange: function,
 * collapsable: boolean,
 * context: object,
 * setParentContext: function,
 * parentCheckboxLabel: string,
 * parentCheckboxName: string,
 * parentCheckboxChecked: boolean,
 * modalType: string
 * }}
 * @returns A list of checkboxes.
 */
const CheckboxList = ({
    itemDefs,
    readOnly,
    onCheckboxChange,
    collapsable,
    context,
    setParentContext,
    parentCheckboxLabel,
    parentCheckboxName,
    parentCheckboxChecked,
    modalType,
    isDesignRules
}) => {
    const checkbox = useRef();
    const [isExpanded, setIsExpanded] = useState(context[0].expanded);
    const [isParentChecked, setIsParentChecked] = useState({ checked: parentCheckboxChecked });
    const { imageContext, setImageContext } = useContext(ModalContext);

    useEffect(() => {
        /* Adding the parentCheckboxName to the imageContext array. */
        setImageContext(prevState => {
            return [...prevState, { name: parentCheckboxName, validated: '', numWarnings: 0 }];
        });
    }, []);

    useEffect(() => {
        /* Setting the state of the parent component. */
        setParentContext([
            {
                data: context[0].data,
                expanded: isExpanded,
                items: context[0].items
            }
        ]);
    }, [isExpanded]);

    /**
     * `handleOnChange` is a function that takes in `setUseState`, `isChecked`, and `checkbox` as
     * arguments and returns a function that sets the state of `isChecked` to the opposite of its
     * current value and calls `onCheckboxChange` with the name and checked value of the checkbox
     * @param {function} setUseState - This is the setState function that is passed to the useState hook.
     * @param {object} isChecked - The current state of the checkbox.
     * @param {object} checkbox - the checkbox element
     */
    const handleOnChange = (setUseState, isChecked, checkbox) => {
        setUseState({ checked: !isChecked.checked });
        onCheckboxChange({ name: checkbox.current.name, checked: checkbox.current.checked });
    };

    /**
     * It changes the direction of the arrow.
     * @param {boolean} state - the current boolean of the useState hook `isExpanded`
     */
    const changeArrowDirection = state => {
        setIsExpanded(!state);
    };

    /**
     * It takes `itemDefsArray, and `contextArray`, and returns an array of objects
     * @param {array} itemDefsArray - an array of objects that contain the name and label of the checkbox
     * @param {array} contextArray - array that contains the data for the checkboxes.
     * @returns An array of checkboxes.
     */
    const buildRows = (itemDefsArray, contextArray) => {
        return itemDefsArray.map((itemDef, i) => {
            const foundCheckboxValue = contextArray[0].items.findIndex(
                item => item.name === itemDef.name
            );
            const spreadContext = [...context[0].items];

            if (!spreadContext[foundCheckboxValue]) {
                return;
            }
            return (
                <li key={`${itemDef}-${i}`} className="checkbox-container_list-item-container">
                    <Checkbox
                        checkedValue={spreadContext[foundCheckboxValue].checked}
                        name={itemDef.name}
                        disabled={readOnly}
                        onCheckboxChange={onCheckboxChange}
                        labelName={itemDef.label}
                        checkboxImageMethod={renderValidationImg}
                        context={contextArray}
                        modalType={modalType}
                        handleOnChange={handleOnChange}
                        isDesignRules={isDesignRules}
                    />
                </li>
            );
        });
    };

    return (
        <>
            {!collapsable ? (
                <ul className="checkbox-container checkbox-container_no-parent">
                    {buildRows(itemDefs, context)}
                </ul>
            ) : (
                <div className="checkbox-container">
                    <div className="checkbox-container_parent-checkbox-container">
                        <input
                            type="checkbox"
                            ref={checkbox}
                            name={parentCheckboxName}
                            id={parentCheckboxLabel}
                            checked={isParentChecked.checked}
                            disabled={readOnly}
                            className="checkbox-container_parent-checkbox"
                            onChange={() =>
                                handleOnChange(setIsParentChecked, isParentChecked, checkbox)
                            }
                        />
                        <label className="checkbox-container_label" htmlFor={parentCheckboxLabel}>
                            {parentCheckboxLabel}
                        </label>
                        <div
                            id="arrowSVG"
                            className={`expandWidgetGroup arrowSVG ${isExpanded ? 'expanded' : ''}`}
                            onClick={() => changeArrowDirection(isExpanded)}
                        ></div>
                        {renderValidationImg(imageContext, parentCheckboxName)}
                    </div>
                    <ul className={`checkbox-container_list show ${isExpanded ? '' : 'hide-tree'}`}>
                        {buildRows(itemDefs, context)}
                    </ul>
                </div>
            )}
        </>
    );
};

export default CheckboxList;
