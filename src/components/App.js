import React, { Fragment } from "react"
import Header from "../containers/Header"
import MainSection from "../components/MainSection"
import { Consumer } from "../context"

const App = () => (
  <Consumer>
    {app => (
      <Fragment>
        {app.state.is("Ready") ? (
          <div>
            <Header />
            <MainSection />
          </div>
        ) : app.state.not("SigningIn") ? (
          <button onClick={app.state.addByListener("SignInClicked")}>
            Sign In With Blockstack
          </button>
        ) : null}
      </Fragment>
    )}
  </Consumer>
)

export default App
