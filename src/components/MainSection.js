import React from "react"
import Footer from "./Footer"
import TodoList from '../components/TodoList'
import { Consumer } from "../context"

const MainSection = () => (
  <Consumer>
    {app => (
      <section className="main">
        {!!app.data.filtered_todos.length && (
          <span>
            <input
              className="toggle-all"
              type="checkbox"
              checked={app.data.completedCount === app.data.filtered_todos.length}
            />
            <label onClick={app.state.addByListener('CompletingAllTodos')} />
          </span>
        )}
        <TodoList />
        {!!app.data.todos.length && (
          <Footer
            completedCount={app.data.completedCount}
            activeCount={app.data.activeCount}
            onClearCompleted={app.state.addByListener('ClearingCompleted')}
          />
        )}
      </section>
    )}
  </Consumer>
)

// MainSection.propTypes = {
//   todosCount: PropTypes.number.isRequired,
//   completedCount: PropTypes.number.isRequired,
//   actions: PropTypes.object.isRequired
// }

export default MainSection
