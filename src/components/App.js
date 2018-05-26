import React, { Fragment } from "react"
import Header from "../components/Header"
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
        ) : app.state.is("NotSignedIn") ? (
          <a
            style={{ padding: "1em" }}
            href="#"
            onClick={app.state.addByListener("SignInClicked")}
          >
            Sign In With Blockstack
          </a>
        ) : null}
      </Fragment>
    )}
  </Consumer>
)

export default App
