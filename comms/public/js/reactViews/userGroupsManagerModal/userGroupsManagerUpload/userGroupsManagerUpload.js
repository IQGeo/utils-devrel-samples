import React, { useState, useContext, useEffect } from 'react';
import reactViewsRegistry from '../../../base/reactViewsRegistry';
import { Button, Upload, Spin } from 'antd';
import AppContext from '../../appContext';
import { UploadOutlined } from '@ant-design/icons';
import Papa from 'papaparse';
import myw from 'myWorld-client';

export default function UserGroupManagerUpload({ userGroups, onUpload }) {
    const { msg } = myw.react.useLocale('UserGroupsManagerDialog');
    const [loadData, setLoadData] = useState([]);
    const [info, setInfo] = useState();
    const { appRef } = useContext(AppContext);
    const { openNotificationWithIcon } =
        reactViewsRegistry.reactViews.UserGroupsManagerUpload.functions;

    useEffect(() => {
        update();
    }, [loadData]);

    const update = () => {
        if (!loadData.data) return;

        const groups = loadData.data.map(row => {
            const members = row.members?.trim().split(';');
            return {
                ...row,
                members
            };
        });

        openNotificationWithIcon({
            key: 'uploader',
            type: 'info',
            title: info.file.name,
            message: <Spin />,
            duration: 0
        });
        return appRef.plugins['userGroupManager']
            .saveGroups(groups)
            .then(() => {
                setLoadData([]);
                openNotificationWithIcon({
                    key: 'uploader',
                    type: 'success',
                    title: info.file.name,
                    message: msg('upload_success'),
                    duration: 1.5
                });
            })
            .catch(() => {
                openNotificationWithIcon({
                    key: 'uploader',
                    type: 'error',
                    title: info.file.name,
                    message: 'Error completing upload of file.',
                    duration: 3
                });
            })
            .finally(() => {
                onUpload();
            });
    };

    // ENH: Move functions to functions directory.
    const uploadProperties = {
        name: 'file',
        multiple: false,
        showUploadList: false,
        customRequest: info => {
            setInfo(info);
        },
        beforeUpload: async rawFile => {
            const isCSV = rawFile.type === 'text/csv';
            if (!isCSV) {
                openNotificationWithIcon({
                    key: 'uploader',
                    type: 'error',
                    title: rawFile.name,
                    message: msg('upload_error_invalid_file_type', { fileName: rawFile.name }),
                    duration: 3
                });
                return Upload.LIST_IGNORE;
            }

            const parseUploadFile = file =>
                new Promise((resolve, reject) => {
                    return Papa.parse(file, {
                        header: true,
                        skipEmptyLines: true,
                        transformHeader: header => {
                            return header.toLocaleLowerCase().trim();
                        },
                        complete: async results => {
                            // Filter out records that have no name
                            results.data = results.data.filter(row => row.name);
                            let duplicates = results.data.filter(row => {
                                return userGroups.find(userGroup => {
                                    return userGroup.name === row.name && !row.id;
                                });
                            });
                            if (duplicates.length > 0) {
                                reject(msg('upload_error_duplicate_groups'));
                            } else if (results.data.length === 0) {
                                reject(
                                    msg('upload_error_invalid_file', { fileName: rawFile.name })
                                );
                            } else {
                                resolve(results);
                            }
                        }
                    });
                });

            try {
                const uploadData = await parseUploadFile(rawFile);

                setLoadData(uploadData);

                return uploadData;
            } catch (error) {
                openNotificationWithIcon({
                    key: 'uploader',
                    type: 'error',
                    title: rawFile.name,
                    message: error,
                    duration: 3
                });
            }
            return Upload.LIST_IGNORE;
        }
    };

    return (
        <Upload {...uploadProperties}>
            <Button style={{ margin: '6px 12px 6px 6px' }} icon={<UploadOutlined />}>
                {msg('import')}
            </Button>
        </Upload>
    );
}
