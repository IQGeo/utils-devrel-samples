import { notification } from 'antd';

// See antd documentation for further info on what specific properties do
// To use properties not included in options a custom notification Component must be made
export function openNotificationWithIcon(options) {
    const { type, message, description, duration, placement, onClick, onClose, key } = options;
    const openDuration = typeof duration === 'number' ? duration : 4.5;
    notification[type || 'success']({
        message: message || '',
        description: description || '',
        duration: openDuration,
        placement: placement || 'topRight',
        onClick,
        onClose,
        key
    });
}
