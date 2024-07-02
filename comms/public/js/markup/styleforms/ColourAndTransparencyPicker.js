// Copyright: IQGeo Limited 2010-2023
import React, { Component } from 'react';
import reactCSS from 'reactcss';
import CustomSketchPicker from './CustomSketchPicker';

const getColor = (colorString, opacity) => {
    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(colorString);
    const rgb = result
        ? {
              r: parseInt(result[1], 16),
              g: parseInt(result[2], 16),
              b: parseInt(result[3], 16)
          }
        : null;
    const color = { ...rgb, ...{ a: opacity ?? 1 } };
    return color;
};

export class ColourAndTransparencyPicker extends Component {
    static getDerivedStateFromProps(props, state) {
        return {
            displayColorPicker: state?.displayColorPicker || false,
            color: state?.color || getColor(props.color, props.opacity)
        };
    }
    constructor(props) {
        super(props);
        this.state = {};
    }

    handleClick = () => {
        this.setState({ displayColorPicker: !this.state.displayColorPicker });
    };

    handleClose = () => {
        this.setState({ displayColorPicker: false });
        if (this.state.colorActual)
            this.props.onChange({
                color: this.state.colorActual.hex,
                opacity: this.state.colorActual.rgb.a
            });
    };

    handleChange = color => {
        this.setState({ color: color.rgb });
        this.setState({ colorActual: color });
    };

    render() {
        const color = this.state.color;

        const styles = reactCSS({
            default: {
                color: {
                    width: '140px',
                    height: '14px',
                    borderRadius: '2px',
                    background: `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a})`,
                    opacity: color.a
                },
                swatch: {
                    padding: '5px',
                    background:
                        "url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAMUlEQVQ4T2NkYGAQYcAP3uCTZhw1gGGYhAGBZIA/nYDCgBDAm9BGDWAAJyRCgLaBCAAgXwixzAS0pgAAAABJRU5ErkJggg==') left center",
                    borderRadius: '1px',
                    boxShadow: '0 0 0 1px rgba(0,0,0,.1)',
                    display: 'inline-block',
                    cursor: 'pointer',
                    verticalAlign: 'middle'
                },
                popover: {
                    zIndex: '2'
                },
                cover: {
                    position: 'fixed',
                    top: '0px',
                    right: '0px',
                    bottom: '0px',
                    left: '0px'
                }
            }
        });

        let presetColors;
        if (!this.props.disallowTransparent) {
            presetColors = [
                'TRANSPARENT',
                '#D0021B',
                '#F5A623',
                '#F8E71C',
                '#8B572A',
                '#7ED321',
                '#417505',
                '#BD10E0',
                '#9013FE',
                '#4A90E2',
                '#50E3C2',
                '#B8E986',
                '#000000',
                '#4A4A4A',
                '#9B9B9B',
                '#FFFFFF'
            ];
        }

        return (
            <div>
                <div style={styles.swatch} onClick={this.handleClick}>
                    <div style={styles.color} />
                </div>
                {this.state.displayColorPicker ? (
                    <div style={styles.popover}>
                        <div style={styles.cover} onClick={this.handleClose} />
                        <CustomSketchPicker
                            color={this.state.color}
                            onChange={this.handleChange}
                            disableAlpha={this.props.disableAlpha}
                            presetColors={presetColors}
                        />
                    </div>
                ) : null}
            </div>
        );
    }

    hexToRgb(hex) {
        var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result
            ? {
                  r: parseInt(result[1], 16),
                  g: parseInt(result[2], 16),
                  b: parseInt(result[3], 16)
              }
            : null;
    }
}
