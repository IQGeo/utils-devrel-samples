// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import myw from 'myWorld-client';
import React from 'react';
import { ConfigProvider } from 'antd';
import { theme } from 'myWorld-client/react';

import { Checkbox, Divider } from 'antd';
import { renderReactNode } from 'myWorld-client/react';

/**
 * Simple UI dialog for presenting list of options for user to select all or a subset of.
 *
 */

const ItemList = props => {
    const plainOptions = props.data;
    const CheckboxGroup = Checkbox.Group;

    const [checkedList, setCheckedList] = React.useState(plainOptions);
    const [indeterminate, setIndeterminate] = React.useState(false);
    const [checkAll, setCheckAll] = React.useState(true);

    const onChange = list => {
        setCheckedList(list);
        setIndeterminate(!!list.length && list.length < plainOptions.length);
        setCheckAll(list.length === plainOptions.length);
        props.setCheckedList(list);
    };

    const onCheckAllChange = e => {
        setCheckedList(e.target.checked ? plainOptions : []);
        setIndeterminate(false);
        setCheckAll(e.target.checked);
        props.setCheckedList(e.target.checked ? plainOptions : []);
    };

    return (
        <ConfigProvider theme={theme}>
            <Checkbox indeterminate={indeterminate} onChange={onCheckAllChange} checked={checkAll}>
                Check all
            </Checkbox>
            <Divider />
            <CheckboxGroup options={plainOptions} value={checkedList} onChange={onChange} />
        </ConfigProvider>
    );
};

class ItemSelectDialog extends myw.Dialog {
    static {
        this.mergeOptions({
            position: { my: 'center', at: 'top', of: window, collision: 'fit' },
            contents: $('<div>', {
                id: 'attachments-dialog-content',
                class: 'attachments-container antd-component'
            }),
            destroyOnClose: true,
            width: 600
        });
    }

    constructor(owner, options) {
        super(options);
        this.owner = owner;
        this.data = options.data;
        this.options.title = options.title;
        this.options.buttons = {
            Close: {
                text: '{:cancel_btn}',
                class: 'right',
                click: () => {
                    this.cancelChanges();
                }
            },
            Ok: {
                text: '{:ok_btn}',
                class: 'primary-btn',
                click: () => {
                    options.action(this.data);
                    this.close();
                }
            }
        };

        this.render();
        this.renderAttachmentContent(this.options.attachments);
    }

    renderAttachmentContent(attachments, updatedAttachmentProps = {}) {
        const container = document.querySelector('.attachments-container');

        this.renderRoot = renderReactNode(
            container,
            ItemList,
            {
                data: this.options.data,
                setCheckedList: cl => {
                    this.data = cl;
                }
            },
            this.renderRoot
        );
    }

    cancelChanges() {
        this.close();
    }
}

export default ItemSelectDialog;
