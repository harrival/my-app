import React from 'react';
import PropTypes from 'prop-types';
import classes from './Input.module.scss';

const Select = ({ options, value, onChange, label, placeholder, disabled }) => {
    return (
        <div className="select-container">
            {label && <label className="select-label">{label}</label>}
            <select
                className="select-input"
                value={value}
                onChange={onChange}
                disabled={disabled}
            >
                {placeholder && (
                    <option value="" disabled>
                        {placeholder}
                    </option>
                )}
                {options.map((option) => (
                    <option key={option.value} value={option.value}>
                        {option.label}
                    </option>
                ))}
            </select>
        </div>
    );
};

Select.propTypes = {
    options: PropTypes.arrayOf(
        PropTypes.shape({
            value: PropTypes.string.isRequired,
            label: PropTypes.string.isRequired,
        })
    ).isRequired,
    value: PropTypes.string.isRequired,
    onChange: PropTypes.func.isRequired,
    label: PropTypes.string,
    placeholder: PropTypes.string,
    disabled: PropTypes.bool,
};

Select.defaultProps = {
    label: '',
    placeholder: 'Select an option',
    disabled: false,
};

export default Select;