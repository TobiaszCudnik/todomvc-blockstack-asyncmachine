import React, { Fragment } from "react"
import Header from "../containers/Header"
import MainSection from "../components/MainSection"
import { Consumer } from "../context"

const App = () => (
  <Consumer>
    {app => (
      <Fragment>
        {app.state.is("SignedIn") ? (
          <div>
            <Header />
            <MainSection />
          </div>
        ) : (
          <button onClick={app.state.addByListener("SignInClicked")}>
            Sign In With Blockstack
          </button>
        )}
      </Fragment>
    )}
  </Consumer>
)

export default App
