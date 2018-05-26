import { machine } from "asyncmachine"
import * as filter_types from "./constants/TodoFilters"
import * as blockstack from "blockstack"
// TODO use encryptContent from blockstack ?
import Crypto from "simple-crypto-js"
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
  SigningIn: { drop: ["SignedIn", "NotSignedIn"] },
  SignedIn: {
    drop: ["SigningIn", "NotSignedIn"],
    add: ["ReadingDB", "ReadingSubscribers"]
  },
  NotSignedIn: { drop: ["SignedIn", "SigningIn"] },
  SignOutClicked: {},

  // SYNCING DB

  InitialDBRead: {},

  ReadingDB: {
    require: ["KeyLoaded"],
    drop: ["WritingDB", "DBReadingDone"]
  },
  DBReadingDone: {
    drop: ["ReadingDB"],
    add: ["InitialDBRead"]
  },

  WritingDB: {
    require: ["KeyLoaded"],
    drop: ["ReadingDB", "DBWritingDone"]
  },
  DBWritingDone: { drop: ["WritingDB"] },

  // SUBSCRIBERS

  ReadingSubscribers: {
    drop: ["WritingSubscribers", "SubscribersReadingDone"]
  },
  SubscribersReadingDone: { drop: ["ReadingSubscribers"] },

  WritingSubscribers: {
    drop: ["ReadingSubscribers", "SubscribersWritingDone"]
  },
  SubscribersWritingDone: { drop: ["WritingSubscribers"] },

  AddingSubscriber: {},
  SubscriberAdded: { drop: ["AddingSubscriber"] },

  SyncingExternalDBs: {},

  // KEY

  LoadingKey: {},
  KeyLoaded: { drop: ["LoadingKey"] },

  // METAS

  Ready: {
    auto: true,
    require: ["KeyLoaded", "SignedIn", "InitialDBRead"]
  }
}

export default class Manager {
  // config
  data_file = "todos9.json"
  subscribers_file = "subscribers.json"
  log_level = 1

  state = machine(state)
  data = new Data()
  encoders = {}
  data_key = null

  constructor() {
    window.app = this
    this.state
      .setTarget(this)
      .id("todos")
      .logLevel(this.log_level)
    if (blockstack.isUserSignedIn()) {
      this.state.add("SignedIn")
    } else if (blockstack.isSignInPending()) {
      this.state.add("SigningIn")
    } else {
      this.state.add("NotSignedIn")
    }
  }

  // ----- TRANSITIONS

  // ADD

  AddingTodo_enter(text) {
    return Boolean(text)
  }

  async AddingTodo_state(text) {
    this.data.todos.unshift({
      id: Crypto.generateRandom(),
      text,
      completed: false
    })
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
    const origin = window.location.origin
    blockstack.redirectToSignIn(origin, origin + "/manifest.json", [
      "store_write",
      "publish_data"
    ])
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
    const username = this.data.user.username
    const encrypted_db = this.encoders[username].encrypt(
      JSON.stringify(this.data.todos)
    )
    await blockstack.putFile(this.data_file, encrypted_db, { encrypt: false })
    this.state.add("DBWritingDone")
  }

  async ReadingDB_state() {
    let encrypted_json = await blockstack.getFile(this.data_file, {
      decrypt: false
    })
    if (!encrypted_json) {
      this.state.add("DBReadingDone")
      this.state.add("WritingDB")
    } else {
      const username = this.data.user.username
      const decrypted_json = this.encoders[username].decrypt(encrypted_json)
      this.data.todos = JSON.parse(decrypted_json)
      this.state.add("DBReadingDone")
    }
  }

  // EXTERNAL TODOS

  // TODO these should be 2 separate states
  async ReadingSubscribers_state() {
    // initial sync
    if (!this.data.subscribers) {
      this.data.subscribers = []
      const json = await blockstack.getFile(this.subscribers_file)
      // initially there's no subscribers
      if (json) {
        this.data.subscribers = JSON.parse(json)
        this.state.add("SyncingExternalDBs")
        // read in parallel
        await Promise.all(
          this.data.subscribers.map(sub => this.readExternalDB(sub.username))
        )
        this.state.drop("SyncingExternalDBs")
        await this.saveFile()
      }
      // 2nd and later syncs
    } else {
      this.state.add("SyncingExternalDBs")
      // read in parallel
      await Promise.all(
        this.data.subscribers.map(sub => this.readExternalDB(sub.username))
      )
      this.state.drop("SyncingExternalDBs")
      this.state.add("SubscribersReadingDone")
    }
    this.state.add("SubscribersReadingDone")
  }

  AddingSubscriber_enter(username) {
    if (!username || !username.trim()) return false
    return this.state.not("WritingSubscribers")
  }

  async AddingSubscriber_state(username) {
    username = username.replace(/\.id$/, "") + ".id"
    let key_json
    try {
      key_json = await blockstack.getFile("key.json", {
        username,
        decrypt: false
      })
    } catch (e) {
      console.warn(`Couldn't fetch key.json for user ${username}`)
      return this.state.drop("AddingSubscriber")
    }
    const public_key = JSON.parse(key_json)
    this.data.subscribers.push({ username, public_key })
    await this.saveDataKey(public_key, username, this.data_key)
    this.state.add("WritingSubscribers")
    this.state.add("SyncingExternalDBs")
    await Promise.all([
      this.state.when("SubscribersWritingDone"),
      this.readExternalDB(username)
    ])
    this.state.drop("SyncingExternalDBs")
    this.state.add("SubscriberAdded")
  }

  async WritingSubscribers_state() {
    const json = JSON.stringify(this.data.subscribers)
    await blockstack.putFile(this.subscribers_file, json)
    this.state.add("SubscribersWritingDone")
  }

  async LoadingKey_state() {
    const username = this.data.user.username
    const encrypted_key = JSON.parse(
      await blockstack.getFile(`keys/${username}`, { decrypt: false })
    )
    this.data_key = decryptECIES(this.data.user.appPrivateKey, encrypted_key)
    this.encoders[username] = new Crypto(this.data_key)
    this.state.add("KeyLoaded")
  }

  Exception_state(err, target_states, ...rest) {
    if (target_states.includes("LoadingKey")) {
      // TODO make this handler async once the bug in asyncmachine get fixed
      this.setupKey().then(() => {
        this.state.drop(["Exception", "LoadingKey"])
        this.state.add("LoadingKey")
      })
    } else if (target_states.includes("SigningIn")) {
      this.state.add("NotSignedIn")
      this.state.drop("Exception")
    }
    // call the super handler
    this.state.Exception_state(err, target_states, ...rest)
  }

  // ----- METHODS

  is(states) {
    return this.state.is(states)
  }

  async setupKey() {
    const data_key = Crypto.generateRandom()
    const publicKey = blockstack.getPublicKeyFromPrivate(
      this.data.user.appPrivateKey
    )
    // public key others can use to encrypt their key giving access to the data
    await blockstack.putFile("key.json", JSON.stringify(publicKey), {
      encrypt: false
    })
    await this.saveDataKey(publicKey, this.data.user.username, data_key)
    this.data_key = data_key
  }

  mergeDB(todos) {
    // TODO merge using automerge
    for (const todo of todos) {
      const existing = this.data.get(todo.id)
      if (existing) {
        existing.text = todo.text
        existing.completed = todo.completed
      } else {
        this.data.todos.unshift(todo)
      }
    }
  }

  async saveFile() {
    this.state.add("WritingDB")
    await this.state.when("DBWritingDone")
  }

  async readExternalDB(username) {
    const tasks = [
      await blockstack.getFile(this.data_file, {
        username,
        decrypt: false
      })
    ]
    if (!this.encoders[username]) {
      tasks.push(
        await blockstack.getFile(`keys/${this.data.user.username}`, {
          username,
          decrypt: false
        })
      )
    }
    const [encrypted_db_json, encrypted_data_key_json] = await Promise.all(
      tasks
    )
    if (!this.encoders[username] && !encrypted_data_key_json) {
      console.log(`User "${username}" hasn't exported a key for this user yet`)
      return
    } else if (!this.encoders[username]) {
      // decrypt the data key with our own private key
      const data_key = decryptECIES(
        this.data.user.appPrivateKey,
        JSON.parse(encrypted_data_key_json)
      )
      this.encoders[username] = new Crypto(data_key)
      // only if user has a DB file
    } else if (encrypted_db_json) {
      // decrypt json with the decrypted data key
      const db_json = this.encoders[username].decrypt(encrypted_db_json)
      this.mergeDB(JSON.parse(db_json))
    }
  }

  async saveDataKey(encryption_key, username, data_key) {
    const encrypted_data_key = encryptECIES(encryption_key, data_key)
    await blockstack.putFile(
      `keys/${username}`,
      JSON.stringify(encrypted_data_key),
      { encrypt: false }
    )
  }
}

export class Data {
  todos = []
  visibilityFilter = filter_types.SHOW_ALL
  user = null
  subscribers = null

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
