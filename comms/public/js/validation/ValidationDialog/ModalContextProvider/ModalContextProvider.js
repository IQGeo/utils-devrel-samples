import React, { createContext, useState } from 'react';

export const ModalContext = createContext(null);

export const ModalProvider = ({ children }) => {
    const [context, setContext] = useState([{}]);
    const [designRulesContext, setDesignRulesContext] = useState([{}]);
    const [inWindowContext, setInWindowContext] = useState(false);

    // '', validating, success, error
    const [imageContext, setImageContext] = useState([]);
    const [maxWarningsContext, setMaxWarningsContext] = useState({
        maxWarnings: 100,
        validatedWarnings: 0
    });

    return (
        <ModalContext.Provider
            value={{
                context,
                setContext,
                imageContext,
                setImageContext,
                inWindowContext,
                setInWindowContext,
                maxWarningsContext,
                setMaxWarningsContext,
                designRulesContext,
                setDesignRulesContext
            }}
        >
            {children}
        </ModalContext.Provider>
    );
};
