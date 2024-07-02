import React, { useState } from 'react';
import { Button, Form, Input, message } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import '../public/style/components/_newImportFormatForm.scss';

const NewImportFormatForm = props => {
    const data = [
        {
            msg: 'name',
            onChange: e => {
                e.persist();
                setState(prevState => ({ ...prevState, importName: e.target.value }));
            },
            required: true
        },
        {
            msg: 'description',
            onChange: e => {
                e.persist();
                setState(prevState => ({ ...prevState, importDescription: e.target.value }));
            },
            required: false
        },
        {
            msg: 'engine',
            onChange: e => {
                e.persist();
                setState(prevState => ({ ...prevState, importEngine: e.target.value }));
            },
            required: false
        },
        {
            msg: 'file_specs',
            onChange: e => {
                e.persist();
                setState(prevState => ({ ...prevState, importFileSpecs: e.target.value }));
            },
            required: false
        }
    ];
    let msg = props.msg;
    const [state, setState] = useState({
        importName: '',
        importDescription: '',
        importEngine: '',
        importFileSpecs: ''
    });

    const createInputs = () => {
        return data.map(element => {
            return (
                <Form.Item
                    key={props.msg(element.msg)}
                    label={props.msg(element.msg)}
                    required={element.required}
                >
                    <Input onChange={element.onChange} />
                </Form.Item>
            );
        });
    };

    const addNewImportFormat = () => {
        const name = state.importName;
        let values = {
            name: `mywcom.import_config.${name}`,
            type: 'JSON',
            // Need double quotations since sending JSON.
            value: `{
                "name": "${name}",
                "description": "${state.importDescription}",
                "engine": "${state.importEngine}",
                "file_specs": "${state.importFileSpecs}",
                "mappings": []
            }`
        };
        props.settingsStore
            .save(values)
            .then(async id => {
                message.success(`${props.msg('created')}`);
                await props.settingsStore.get(id);
                props.changeInputState();
            })
            .catch(error => {
                message.error(props.msg('failed_to_add_format', { name }));
            });
    };

    return (
        <Form className="import-form">
            {createInputs()}
            <Button
                icon={<PlusOutlined />}
                title={msg('add')}
                disabled={!state.importName}
                onClick={addNewImportFormat}
            >
                {msg('add')}
            </Button>
        </Form>
    );
};

export default NewImportFormatForm;
