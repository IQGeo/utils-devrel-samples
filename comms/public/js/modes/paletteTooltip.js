import React, { useState, useEffect } from 'react';

const PaletteTooltip = ({ id, content, height }) => {
    const [isShown, setIsShown] = useState(false);
    const [mousePosition, setMousePosition] = useState({ x: null, y: null });

    useEffect(() => {
        const updateMousePosition = ev => {
            setMousePosition({ x: ev.clientX, y: ev.clientY });
        };
        window.addEventListener('mousemove', updateMousePosition);
    }, []);

    const renderTooltip = () => {
        if (!isShown) return null;
        return (
            <div
                className="paletteTooltip-text"
                style={{
                    position: 'fixed',
                    top: `${mousePosition.y - 5}px`,
                    left: `${mousePosition.x - 5}px`
                }}
            >
                {content}
            </div>
        );
    };

    const handleMouse = state => {
        setIsShown(state);
    };

    return (
        <div
            id={id}
            className="paletteTooltip-container"
            onMouseEnter={() => handleMouse(true)}
            onMouseLeave={() => handleMouse(false)}
            style={{ height: height, position: 'absolute', zIndex: 100 }}
        >
            {renderTooltip()}
        </div>
    );
};

export default PaletteTooltip;
