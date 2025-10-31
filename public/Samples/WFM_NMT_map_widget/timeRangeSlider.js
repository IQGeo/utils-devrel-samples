import React, { useState } from 'react';
import { Slider, Typography, Space } from 'antd';
import dayjs from 'dayjs';

const { Text } = Typography;

const TimeRangeSlider = ({
    initialStartTime,
    initialEndTime,
    sliderMinTime,
    sliderMaxTime,
    onChange,
    marks
}) => {
    // Convert initial timestamps to dayjs objects
    const sliderMinTimestamp =
        sliderMinTime || dayjs(initialStartTime).subtract(3, 'days').valueOf();
    const sliderMaxTimestamp = sliderMaxTime || dayjs(initialEndTime).add(3, 'days').valueOf();

    // State to hold the current selected range in milliseconds
    const [currentRange, setCurrentRange] = useState([initialStartTime, initialEndTime]);

    // Handle slider value changes
    const handleSliderChange = value => {
        setCurrentRange(value);
    };

    // Handle slider release (afterChange) to trigger the parent's onChange
    const handleAfterChange = value => {
        if (onChange) {
            onChange({
                startTime: dayjs(value[0]).toISOString(),
                endTime: dayjs(value[1]).toISOString()
            });
        }
    };

    // Format the timestamp for display
    const formatTimestamp = timestamp => {
        return dayjs(timestamp).format('YYYY-MM-DD');
    };

    return (
        <Space direction="vertical" style={{ width: '100%' }}>
            <Text>Selected Range:</Text>
            <Text strong>
                {formatTimestamp(currentRange[0])} - {formatTimestamp(currentRange[1])}
            </Text>
            <Slider
                range
                min={sliderMinTimestamp}
                max={sliderMaxTimestamp}
                value={currentRange}
                onChange={handleSliderChange}
                marks={marks}
                step={86400000} // 1 day in milliseconds (optional, for snapping to days)
                onChangeComplete={handleAfterChange}
                tipFormatter={formatTimestamp} // Format tooltip values
            />
        </Space>
    );
};

export default TimeRangeSlider;
