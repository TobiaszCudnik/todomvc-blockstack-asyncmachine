import { machine } from "asyncmachine"
import * as filter_types from "./constants/TodoFilters"
import * as blockstack from "blockstack"
import SimpleCryptoJS from "simple-crypto-js"
import { encryptECIES, decryptECIES } from "blockstack/lib/encryption"

const state = {
  //  UI Actions

  AddingTodo: {},
  TodoAdded: { drop: ["AddingTodo"] },

  EditingTodo: {},
  TodoEdited: { drop: ["EditingTodo"] },

  DeletingTodo: {},
  TodoDeleted: { drop: ["DeletingTodo"] },

  CompletingTodo: {},
  TodoCompleted: { drop: ["CompletingTodo"] },

  CompletingAllTodos: {},
  AllTodosCompleted: { drop: ["CompletingAllTodos"] },

  ClearingCompleted: {},
  CompletedCleared: { drop: ["ClearingCompleted"] },

  SetVisibilityFilter: {},

  // SIGIN IN

  SignInClicked: {},
  SigningIn: {},
  SignedIn: {
    drop: ["SigningIn"],
    add: ["ReadingDB", "ReadingSubscribers"]
  },
  SignOutClicked: {},

  // SYNCING DB

  InitialDBRead: {},

  ReadingDB: { drop: ["WritingDB", "DBReadingDone"] },
  DBReadingDone: { drop: ["ReadingDB"], add: ["InitialDBRead"] },

  WritingDB: { drop: ["ReadingDB", "DBWritingDone"] },
  DBWritingDone: { drop: ["WritingDB"] },

  // SYNCING SUBSCRIBERS

  ReadingSubscribers: {
    drop: ["WritingSubscribers", "SubscribersReadingDone"]
  },
  SubscribersReadingDone: { drop: ["ReadingSubscribers"] },

  WritingSubscribers: {
    drop: ["ReadingSubscribers", "SubscribersWritingDone"]
  },
  SubscribersWritingDone: { drop: ["WritingSubscribers"] },

  // ADDING A SUBSCRIBER

  AddingSubscriber: {},
  SubscriberAdded: { drop: ["AddingSubscriber"] },

  // KEY

  LoadingKey: {},
  KeyLoaded: { drop: ["LoadingKey"] },

  // METAS

  Ready: {
    auto: true,
    require: ["KeyLoaded", "SignedIn"]
  }
}

export default class Manager {
  // config
  todos_file = "todos.json"
  subscribers_file = "subscribers.json"
  log_level = 2

  state = machine(state)
  data = new Data()

  constructor() {
    this.state
      .setTarget(this)
      .id("todos")
      .logLevel(this.log_level)
    if (blockstack.isUserSignedIn()) {
      this.state.add("SignedIn")
    } else if (blockstack.isSignInPending()) {
      this.state.add("SigningIn")
    }
  }

  // ----- TRANSITIONS

  // ADD

  AddingTodo_enter(text) {
    return Boolean(text)
  }

  async AddingTodo_state(text) {
    this.data.todos.unshift({ id: Math.random(), text, completed: false })
    this.state.add(["TodoAdded", "WritingDB"])
  }

  TodoAdded_state() {
    this.state.drop("TodoAdded")
  }

  // EDIT

  EditingTodo_enter(id) {
    if (!this.data.get(id)) {
      return false
    }
  }

  async EditingTodo_state(id, text) {
    this.data.get(id).text = text
    this.state.add(["TodoEdited", "WritingDB"])
  }

  TodoEdited_state() {
    this.state.drop("TodoEdited")
  }

  // DELETE

  DeletingTodo_enter(id) {
    if (!this.data.get(id)) {
      return false
    }
  }

  async DeletingTodo_state(id) {
    const index = this.data.todos.findIndex(t => t.id === id)
    // I regret nothing...
    this.data.todos.splice(index, 1)
    this.state.add(["TodoDeleted", "WritingDB"])
  }

  TodoDeleted_state() {
    this.state.drop("TodoDeleted")
  }

  // COMPLETE
  // handles both - completing and un-completing

  CompletingTodo_enter(id) {
    if (!this.data.get(id)) {
      return false
    }
  }

  async CompletingTodo_state(id, state) {
    this.data.get(id).completed = !!state
    this.state.add(["TodoCompleted", "WritingDB"])
  }

  TodoCompleted_state() {
    this.state.drop("TodoCompleted")
  }

  SetVisibilityFilter_state(filter) {
    this.data.visibilityFilter = filter
    this.state.drop("SetVisibilityFilter")
  }

  // CLEAR COMPLETED

  ClearingCompleted_state() {
    this.data.todos = this.data.todos.filter(t => !t.completed)
    this.state.add(["CompletedCleared", "WritingDB"])
  }

  // SIGN IN

  SignInClicked_state() {
    blockstack.redirectToSignIn()
  }

  async SigningIn_state() {
    await blockstack.handlePendingSignIn()
    this.data.user = blockstack.loadUserData()
    await this.setupKey()
    window.location = window.location.origin
  }

  SignedIn_state() {
    this.data.user = blockstack.loadUserData()
    this.state.add("LoadingKey")
  }

  SignOutClicked_state() {
    blockstack.signUserOut(window.location.origin)
  }

  // TODOS DB

  async WritingDB_state() {
    const encrypt = true
    await blockstack.putFile(
      this.todos_file,
      JSON.stringify(this.data.todos),
      encrypt
    )
    this.state.add("DBWritingDone")
  }

  async ReadingDB_state() {
    const decrypt = true
    const todos_json = await blockstack.getFile(this.todos_file, decrypt)
    const todos = JSON.parse(todos_json || "[]")

    this.data.todos = todos
    this.state.add("DBReadingDone")
  }

  // EXTERNAL TODOS

  async ReadingSubscribers_state() {
    const json = await blockstack.getFile(this.subscribers_file)
    // initially there's no subscribers
    if (json) {
      this.data.subscribers = JSON.parse(json)
      await this.readSubscribersTodos()
    }
    this.state.add("SubscribersReadingDone")
  }

  async readSubscribersTodos() {
    for (const subscriber of this.data.subscribers) {
      await this.readExternalTodos(subscriber.username)
    }
  }

  async readExternalTodos(username) {
    const json = await blockstack.getFile(this.sub_file, {
      username
    })
    const todos = JSON.parse(json)
    // TODO merge todos with this.data.todos
  }

  AddingSubscriber_enter() {
    return this.not("WritingSubscribers")
  }

  async AddingSubscriber_state(username) {
    const key_json = await blockstack.getFile("key.json", {
      username: username
    })
    this.data.subscribers.push({
      username: username,
      publicKey: JSON.parse(key_json)
    })
    this.state.add("WritingSubscribers")
    await this.state.when("SubscribersWritingDone")
    this.readExternalTodos(username)
  }

  async WritingSubscribers_state() {
    const json = JSON.stringify(this.data.subscribers)
    await blockstack.putFile(this.subscribers_file, json)
    this.state.add("SubscribersWritingDone")
  }

  async setupKey() {
    const aesKey = SimpleCryptoJS.generateRandom()
    const publicKey = blockstack.getPublicKeyFromPrivate(
      this.data.user.appPrivateKey
    )
    await blockstack.putFile("key.json", JSON.stringify(publicKey))

    const encryptedAesKey = encryptECIES(publicKey, aesKey)
    await blockstack.putFile(
      `keys/${this.data.user.username}`,
      JSON.stringify(encryptedAesKey)
    )

    this.data.aesKey = aesKey
  }

  async LoadingKey_state() {
    const key_json = await blockstack.getFile(`keys/${this.data.user.username}`)
    let encryptedKey = JSON.parse(key_json)
    let decryptedKey = decryptECIES(this.data.user.appPrivateKey, encryptedKey)
    this.data.aesKey = decryptedKey
    this.state.add("KeyLoaded")
  }
}

export class Data {
  todos = []
  aesKey = null
  visibilityFilter = filter_types.SHOW_ALL
  user = null
  subscribers = []

  get activeCount() {
    return this.filtered_todos.length - this.completedCount
  }

  get completedCount() {
    return this.todos.filter(t => t.completed).reduce((ret, t) => ++ret, 0)
  }

  get filtered_todos() {
    const t = filter_types
    switch (this.visibilityFilter) {
      case t.SHOW_ACTIVE:
        return this.todos.filter(t => !t.completed)
      case t.SHOW_COMPLETED:
        return this.todos.filter(t => t.completed)
      default:
        return this.todos
    }
  }

  get(id) {
    return this.todos.find(t => t.id === id)
  }
}
