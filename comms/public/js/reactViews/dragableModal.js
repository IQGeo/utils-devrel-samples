import React, { useState } from 'react';
import { Modal, Button, Space } from 'antd';
import { RightOutlined, DownOutlined } from '@ant-design/icons';
import Draggable from 'react-draggable';
import Collapsible from 'react-collapsible';
import myw from 'myWorld-client';

export default function DraggableModal({
    visible,
    handleOk,
    handleCancel,
    okText,
    cancelText,
    busy,
    title,
    content,
    destroyOnClose,
    width,
    style,
    nullFooter
}) {
    const { msg } = myw.react.useLocale('');
    const [bounds, setBounds] = useState({ left: 0, top: 0, bottom: 0, right: 0 });
    const [collapsed, setCollapsed] = useState(false);

    const draggleRef = React.createRef();

    const onStart = (event, uiData) => {
        const { clientWidth, clientHeight } = window?.document?.documentElement; //eslint-disable-line
        const targetRect = draggleRef?.current?.getBoundingClientRect();
        setBounds({
            left: -targetRect?.left + uiData?.x,
            right: clientWidth - (targetRect?.right - uiData?.x),
            top: -targetRect?.top + uiData?.y,
            bottom: clientHeight - (targetRect?.bottom - uiData?.y)
        });
    };

    const footer = nullFooter ? null : (
        <Space>
            <Button onClick={handleOk} type={'primary'} loading={busy}>
                {okText || msg('ok')}
            </Button>
            <Button onClick={handleCancel} disabled={busy}>
                {cancelText || msg('cancel')}
            </Button>
        </Space>
    );

    const modal = (
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
            footer={collapsed ? null : footer}
            bodyStyle={{
                padding: 0,
                background: '#eee'
            }}
            mask={false}
            maskClosable={false}
            wrapClassName={'mywis-draggable-modal'}
            open={visible}
            onOk={handleOk}
            onCancel={handleCancel}
            destroyOnClose={destroyOnClose}
            width={width || 'min-content'}
            style={style || {}}
            zIndex={100}
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

    return modal;
}
