import React, { useEffect, useState } from 'react';
import myw from 'myWorld-client';
import { LoadingOutlined } from '@ant-design/icons';
import { Tree } from 'antd';
import '../../style/components/_equipmentBreakdownTree.scss';

const EquipmentBreakdown = props => {
    const { msg } = myw.react.useLocale('FeatureEditor');
    const [equip, setEquips] = useState(null);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => {
        const func = async () => {
            setLoading(true);
            const equipment = await _getEquipmentAndChildren(props.feature);
            _createDeleteMessage(equipment);
            setLoading(false);
            setEquips(equipment);
        };
        func();
    }, []);

    const _getEquipmentAndChildren = async feature => {
        let equips;
        if ('equipment' in feature.featureDD.fields) {
            equips = await feature.followRelationship('equipment');
        }
        if (!equips) return;
        let equipment = [];
        await Promise.all(
            equips.map(async equip => {
                const icon = myw.config['mywcom.equipment'][equip.featureDD.name].image;
                equipment.push({
                    title: equip.getTitle(),
                    icon: <img src={icon} />,
                    key: `${equip.featureDD.external_name}-${equip.id}`,
                    children: await _getEquipmentAndChildren(equip)
                });
            })
        );
        return equipment;
    };

    const _createDeleteMessage = equipment => {
        if (!equipment) {
            return props.message ? setMessage(props.message) : setMessage('confirm_delete_message');
        }
        if (props.message) {
            return setMessage(props.message);
        }
        const designs = Object.keys(myw.config['mywcom.designs']);
        if (designs.includes(props.feature.getType())) {
            return setMessage('confirm_delete_delta');
        }

        if (equipment.length > 0) {
            return setMessage('delete_struct_will_delete_equip');
        }
        setMessage('confirm_delete_message');
    };

    const _renderSpinner = () => {
        return <LoadingOutlined className="loader" spin />;
    };

    const _renderConfirmDelete = () => {
        if (!message) return;
        return <div className="breakdown-header">{msg(message)}</div>;
    };

    const _renderTree = () => {
        return (
            <div>
                <div className="breakdown-header">{msg(message)}</div>
                <Tree
                    className="equipment-breakdown-tree"
                    treeData={equip}
                    defaultExpandAll={true}
                    showIcon
                    style={{ maxHeight: '500px' }}
                />
            </div>
        );
    };

    const _render = () => {
        // Render spinner while tree is being created.
        if (loading) {
            return _renderSpinner();
        }
        // Will render when has no equipment.
        if (!equip || !equip.length || equip.length === 0) {
            return _renderConfirmDelete();
        }
        // Main breakdown of the equipment.
        if (equip.length) {
            return _renderTree();
        }
    };

    return _render();
};

export default EquipmentBreakdown;
