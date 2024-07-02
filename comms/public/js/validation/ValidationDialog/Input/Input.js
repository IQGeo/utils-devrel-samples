import React, { useRef, useState } from 'react';
import myw from 'myWorld-client';

/**
 * Component that takes in a few props and returns an input field with a label
 * @component
 * @param {{
 * name: string,
 * disabled: boolean,
 * inputType: string,
 * inputClassName: string,
 * value: number,
 * setValue: function,
 * numberInputLabel: string
 * }}
 * @returns An input component
 */
const Input = ({
    name,
    disabled,
    inputType,
    inputClassName,
    value,
    setValue,
    numberInputLabel
}) => {
    const input = useRef();
    const [inputValue, setInputValue] = useState({ value: value || 100 });

    /**
     * Takes in string, parses it to an integer, sets the input value to the parsed
     * input, and sets the value to the parsed input
     * @param {string} - number value as a string
     */
    const handleOnChange = input => {
        if (!isNaN(input) && input > myw.config['mywcom.systemChangesLimit']) {
            input = myw.config['mywcom.systemChangesLimit'];
        }
        input = parseInt(input);
        setInputValue({ value: input });
        setValue(input);
    };

    return (
        <>
            <label className="ui-label" htmlFor={name}>
                {numberInputLabel}
            </label>
            <input
                className={inputClassName}
                type={inputType}
                name={name}
                id={name}
                value={inputValue.value}
                disabled={disabled}
                ref={input}
                onChange={() => handleOnChange(input.current.value)}
                max={isNaN(inputValue.value) ? null : myw.config['mywcom.systemChangesLimit']}
                min={0}
            />
        </>
    );
};

export default Input;
