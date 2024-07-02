import React, { useContext, useEffect, useRef, useState } from 'react';
import { ModalContext } from '../ModalContextProvider/ModalContextProvider';

/**
 * Component that takes in a few props and returns a checkbox with a label
 * and an image
 * @component
 * @param {{checkedValue: boolean,
 *  name: string,
 *  disabled: boolean,
 *  labelName: string,
 *  checkboxImageMethod: function,
 *  context: object,
 *  modalType: string,
 *  handleOnChange: function }}
 * @returns A checkbox component.
 */
const Checkbox = ({
    checkedValue,
    name,
    disabled,
    onCheckboxChange,
    labelName,
    checkboxImageMethod,
    context,
    modalType,
    isDesignRules
}) => {
    const checkbox = useRef();
    const { imageContext } = useContext(ModalContext);
    const [isChecked, setIsChecked] = useState({ checked: checkedValue });
    const [isDisabled, setIsDisabled] = useState(disabled);

    useEffect(() => {
        if (modalType === 'checkDesignReadOnly' || !modalType) {
            return;
        }
        parentCheckboxToggle(context[0].data);
    }, [context[0].data]);

    /**
     * If the parent checkbox is checked, enable the child checkboxes. If the parent checkbox is unchecked,
     * disable the child checkboxes
     * @param {boolean} data - Data value from context array of objects [ { data: boolean } ]
     * @returns the value of the parent checkbox.
     */
    const parentCheckboxToggle = data => {
        if (data === false) {
            setIsDisabled(true);
            return;
        }
        if (data === true) {
            setIsDisabled(false);
            return;
        }
    };

    /**
     * It handles the onChange event for a checkbox.
     * @param {object} isChecked - This is the state of the checkbox.
     * @param {object} checkbox - the checkbox element
     */
    const handleOnChange = (isChecked, checkbox, name) => {
        setIsChecked({ checked: !isChecked.checked });
        if (name) {
            onCheckboxChange({ name: name, checked: checkbox.current.checked });
            return;
        }
        onCheckboxChange({ name: checkbox.current.name, checked: checkbox.current.checked });
    };

    return (
        <>
            {modalType === 'changesFilter' && isDesignRules ? (
                <>
                    <input
                        type="radio"
                        name="radio"
                        ref={checkbox}
                        id={name}
                        value={name}
                        onChange={() => handleOnChange(isChecked, checkbox, name)}
                        defaultChecked={labelName === 'None' ? true : false}
                    />
                    <label htmlFor={name}>{labelName}</label>
                    {checkboxImageMethod(imageContext, name)}
                </>
            ) : (
                <>
                    <input
                        type="checkbox"
                        name={name}
                        id={name}
                        checked={isChecked.checked}
                        disabled={isDisabled}
                        ref={checkbox}
                        onChange={() => handleOnChange(isChecked, checkbox)}
                    />
                    <label htmlFor={name}>{labelName}</label>
                    {checkboxImageMethod(imageContext, name)}
                </>
            )}
        </>
    );
};

export default Checkbox;
