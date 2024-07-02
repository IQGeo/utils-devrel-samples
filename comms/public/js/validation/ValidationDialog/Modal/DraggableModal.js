import React, { useState } from 'react';
import { Modal } from 'antd';
import Draggable from 'react-draggable';
import DraggableModalTitle from './DraggableModalTitle';

/**
 * React component that creates a draggable modal which renders the content
 * inside. The rest of the application can still be accessed when the modal
 * is active.
 * @component
 * @param {{
 *  title: string,
 *  content: Component,
 *  width: string,
 *  style: string,
 *  handleVisible: function,
 *  modalContainerName: string
 * }}
 * @returns A checkbox component.
 */
export default function DraggableModal({
    title,
    content,
    width,
    style,
    handleVisible,
    modalContainerName
}) {
    const [bounds, setBounds] = useState({ left: 0, top: 0, bottom: 0, right: 0 });
    const draggleRef = React.createRef();

    /**
     * Takes in `uiData` as an argument and sets the bounds useState to an object with the
     * `left`, `right`, `top`, and `bottom` properties
     * @param {object} uiData
     */
    const onStart = uiData => {
        const { clientWidth, clientHeight } = window.document.documentElement;
        const targetRect = draggleRef?.current?.getBoundingClientRect();
        setBounds({
            left: -targetRect?.left + uiData?.x,
            right: clientWidth - (targetRect?.right - uiData?.x),
            top: -targetRect?.top + uiData?.y,
            bottom: clientHeight - (targetRect?.bottom - uiData?.y)
        });
    };

    return (
        <Modal
            title={<DraggableModalTitle title={title} />}
            footer={null}
            bodyStyle={{
                padding: 0
            }}
            mask={false}
            maskClosable={false}
            wrapClassName={'mywis-draggable-modal'}
            open={true}
            onCancel={() => handleVisible(modalContainerName)}
            width={width || 'min-content'}
            style={style || {}}
            zIndex={100}
            getContainer={document.getElementById(modalContainerName)}
            modalRender={modal => (
                <Draggable
                    handle={'.draggable-target'}
                    bounds={bounds}
                    onStart={(event, uiData) => onStart(event, uiData)}
                >
                    <div ref={draggleRef}>{modal}</div>
                </Draggable>
            )}
        >
            {content}
        </Modal>
    );
}
