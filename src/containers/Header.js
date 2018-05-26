import React from "react"
import TodoTextInput from "../components/TodoTextInput"
import { Consumer } from "../context"

export default () => (
  <Consumer>
    {app => (
      <header className="header">
        <h1>todos</h1>
        <p
          style={{
            textAlign: "center",
            padding: "0.5em",
            marginBottom: 0
          }}
        >
          Logged in as{" "}
          {app.data.user.profile.name
            ? app.data.user.profile.name
            : "anonymous"}{" "}
          ({app.data.user.username
            ? app.data.user.username
            : app.data.user.identityAddress}{" "}
          |{" "}
          <a href="#" onClick={app.state.addByListener("SignOutClicked")}>
            sign out
          </a>)
        </p>
        <p
          style={{
            margin: "0",
            padding: "0 0.5em"
          }}
        >
          <a
            href="#"
            style={{ marginTop: "1em" }}
            onClick={() =>
              app.state.add("AddingSubscriber", prompt("Username:"))
            }
          >
            Share
          </a>
        </p>
        <TodoTextInput
          newTodo
          onSave={app.state.addByListener("AddingTodo")}
          placeholder="What needs to be done?"
        />
      </header>
    )}
  </Consumer>
)
