import React, { useContext } from 'react';
import myw from 'myWorld-client';
import { ModalContext } from '../ModalContextProvider/ModalContextProvider';

/**
 * It renders a checkbox that controls whether the validation should be run in the
 * whole window.
 * @returns A React component that renders a checkbox and a label.
 */
const InWindowControl = () => {
    const { msg } = myw.react.useLocale('ValidationDialog');
    const { inWindowContext, setInWindowContext } = useContext(ModalContext);

    const handleOnChange = checked => {
        setInWindowContext(checked);
    };

    return (
        <div className="checkbox-container">
            <div className="checkbox-container_parent-checkbox-container">
                <input
                    type="checkbox"
                    name="inWindowCheckbox"
                    id="inWindowCheckbox"
                    checked={inWindowContext.checked}
                    className="checkbox-container_parent-checkbox"
                    onChange={e => handleOnChange(e.target.checked)}
                />
                <label className="checkbox-container_label" htmlFor="inWindowCheckbox">
                    {msg('in_window_only')}
                </label>
            </div>
        </div>
    );
};

export default InWindowControl;
