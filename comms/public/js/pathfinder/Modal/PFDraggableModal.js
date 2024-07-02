import React, { useState } from 'react';
import { Modal, Button } from 'antd';
import { RightOutlined, DownOutlined } from '@ant-design/icons';
import myw from 'myWorld-client';
import Draggable from 'react-draggable';
import Collapsible from 'react-collapsible';

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
const PFDraggableModal = ({
    title,
    content,
    width,
    style,
    handleVisible,
    modalContainerName,
    isGenerating,
    taskMonitorCancel
}) => {
    const [bounds, setBounds] = useState({ left: 0, top: 0, bottom: 0, right: 0 });
    const [collapsed, setCollapsed] = useState(false);
    const draggleRef = React.createRef();
    const { msg } = myw.react.useLocale('PathfinderModePlugin');

    /**
     * Takes in `uiData` as an argument and sets the bounds useState to an object with the
     * `left`, `right`, `top`, and `bottom` properties
     * @param {object} uiData
     */
    const onStart = (event, uiData) => {
        const { clientWidth, clientHeight } = window.document.documentElement;
        const targetRect = draggleRef?.current?.getBoundingClientRect();
        setBounds({
            left: -targetRect?.left + uiData?.x,
            right: clientWidth - (targetRect?.right - uiData?.x),
            top: -targetRect?.top + uiData?.y,
            bottom: clientHeight - (targetRect?.bottom - uiData?.y)
        });
    };

    const handleOnClose = modalContainerName => {
        if (isGenerating) {
            new myw.ConfirmationDialog({
                title: msg('close_pathfinder'),
                msg: msg('close_pathfinder_message'),
                confirmCallback: () => {
                    taskMonitorCancel.cancel();
                    handleVisible(modalContainerName);
                }
            });
            return;
        }
        handleVisible(modalContainerName);
    };

    return (
        <Modal
            title={
                <div style={{ display: 'flex' }} className={'draggable-title'}>
                    <Button onClick={() => setCollapsed(!collapsed)} type="text">
                        {collapsed ? <RightOutlined /> : <DownOutlined />}
                    </Button>
                    <div
                        className={'draggable-target'}
                        style={{
                            width: '100%',
                            cursor: 'move',
                            marginLeft: '.5em',
                            display: 'flex',
                            alignItems: 'center'
                        }}
                        // fix eslintjsx-a11y/mouse-events-have-key-events
                        // https://github.com/jsx-eslint/eslint-plugin-jsx-a11y/blob/master/docs/rules/mouse-events-have-key-events.md
                        onFocus={() => {}}
                        onBlur={() => {}}
                        // end
                    >
                        {title}
                    </div>
                </div>
            }
            footer={null}
            bodyStyle={{
                padding: 0
            }}
            mask={false}
            maskClosable={false}
            wrapClassName={'mywis-draggable-modal'}
            open={true}
            onCancel={() => handleOnClose(modalContainerName)}
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
            <Collapsible open={!collapsed} transitionTime={250} easing="ease-in">
                {content}
            </Collapsible>
        </Modal>
    );
};

export default PFDraggableModal;
