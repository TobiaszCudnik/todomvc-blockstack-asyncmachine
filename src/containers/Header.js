import React from "react"
import TodoTextInput from "../components/TodoTextInput"
import { Consumer } from "../context"

export default () => (
  <Consumer>
    {app => (
      <header className="header">
        <h1>todos</h1>
        <TodoTextInput
          newTodo
          onSave={app.state.addByListener("AddingTodo")}
          placeholder="What needs to be done?"
        />
      </header>
    )}
  </Consumer>
)
