import React, { useEffect, useState } from 'react';

const CircuitDropdown = ({ circuits, handleSetChosenCircuit, disable, label, dataSource }) => {
    const [circuitOptions, setCircuitOptions] = useState();

    useEffect(() => {
        if ((!disable && Object.keys(circuits).length === 0) || disable) {
            setCircuitOptions(<option className="circuit-dropdown__option"></option>);
            return;
        }

        if (!disable && Object.keys(circuits).length > 0) {
            setCircuitOptions(
                Object.keys(circuits).map((value, index) => {
                    const featureDD = dataSource.featuresDD[value];
                    if (index === 0) {
                        handleSetChosenCircuit(value);
                    }
                    return (
                        <option className="circuit-dropdown__option" key={value} value={value}>
                            {featureDD.external_name}
                        </option>
                    );
                })
            );
            return;
        }
    }, [disable]);

    return (
        <div className="circuit-dropdown">
            <label htmlFor="circuit-dropdown-list" className="circuit-dropdown__label">
                {label}
            </label>
            <select
                id="circuit-dropdown-list"
                className="circuit-dropdown__select"
                onChange={e => handleSetChosenCircuit(e.target.value)}
                disabled={disable}
            >
                {circuitOptions}
            </select>
        </div>
    );
};

export default CircuitDropdown;
