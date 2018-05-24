import React from "react"
import PropTypes from "prop-types"
import classnames from "classnames"
import { Consumer } from "../context"

const Link = ({ active, children, setFilter }) => (
  <Consumer>
    {app => (
      <a
        className={classnames({ selected: active })}
        style={{ cursor: "pointer" }}
        onClick={() => setFilter()}
      >
        {children}
      </a>
    )}
  </Consumer>
)

Link.propTypes = {
  active: PropTypes.bool.isRequired,
  children: PropTypes.node.isRequired,
  setFilter: PropTypes.func.isRequired
}

export default Link
