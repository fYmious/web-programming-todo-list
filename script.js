'use strict'

function todayIso() {
    return new Date().toISOString().slice(0, 10);
}

function Record(text, id, date = todayIso(), done = false) {
    this.text = text;
    this.id = id;
    this.date = date;
    this.done = done;
}
Record.prototype.markDone = function () { this.done = true; };
Record.prototype.markNotDone = function () { this.done = false; };
Record.prototype.isDone = function () { return this.done; };
Record.prototype.edit = function (newText, newDate) {
    this.text = newText;
    if (newDate) this.date = newDate;
};

function RecordList() {
    this.elements = [];
}
RecordList.prototype.size = function () { return this.elements.length; };
RecordList.prototype.add = function (e) { this.elements.push(e); };
RecordList.prototype.remove = function (id) {
    this.elements = this.elements.filter(el => el.id !== id);
};
RecordList.prototype.at = function (id) {
    return this.elements.find(el => el.id === id) ?? null;
};
RecordList.prototype.toggle = function (id) {
    const el = this.at(id);
    if (el === null) return;
    if (el.isDone()) el.markNotDone(); else el.markDone();
};
RecordList.prototype.edit = function (id, newText, newDate) {
    const el = this.at(id);
    if (el !== null) el.edit(newText, newDate);
};
RecordList.prototype.getVisible = function (view) {
    const query = view.query.trim().toLowerCase();

    const result = this.elements.filter(el => {
        if (view.filter === "done" && !el.isDone()) return false;
        if (view.filter === "notDone" && el.isDone()) return false;
        return el.text.toLowerCase().includes(query);
    });

    if (view.sort === "newest") result.sort((a, b) => b.date.localeCompare(a.date));
    if (view.sort === "oldest") result.sort((a, b) => a.date.localeCompare(b.date));
    return result;
};
RecordList.prototype.moveBefore = function (id, targetId) {
    const from = this.elements.findIndex(el => el.id === id);
    const to = this.elements.findIndex(el => el.id === targetId);
    if (from === -1 || to === -1 || from === to) return;

    const [moved] = this.elements.splice(from, 1);
    this.elements.splice(to, 0, moved);
};

const STORAGE_KEY = "recordList";

function loadRecordList() {
    const list = new RecordList();
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw === null) return list;

        const data = JSON.parse(raw);
        for (const r of data.elements) {
            list.add(new Record(r.text, r.id, r.date, r.done));
        }
    } catch (e) {
        console.error("Could not load saved list", e);
    }
    return list;
}

const recordList = loadRecordList();
const viewState = {query: "", filter: "all", sort: "manual"};
let nextId = recordList.elements.reduce((max, r) => Math.max(max, r.id), -1) + 1;
let editingId = null;
let dragId = null;

const STYLE_LINK = document.createElement("link");
STYLE_LINK.rel = "stylesheet";
STYLE_LINK.href = "css/style.css";
document.head.append(STYLE_LINK);

const APP = document.createElement("main");
APP.className = "app";

const TITLE = document.createElement("h1");
TITLE.textContent = "To-Do List";

const ADD_FORM = document.createElement("form");
ADD_FORM.className = "add-form";

const TASK_TEXT_INPUT = document.createElement("input");
TASK_TEXT_INPUT.type = "text";
TASK_TEXT_INPUT.placeholder = "New task";

const TASK_DATE_INPUT = document.createElement("input");
TASK_DATE_INPUT.type = "date";
TASK_DATE_INPUT.value = todayIso();

const ADD_BUTTON = document.createElement("button");
ADD_BUTTON.type = "submit";
ADD_BUTTON.textContent = "add task";

ADD_FORM.append(TASK_TEXT_INPUT, TASK_DATE_INPUT, ADD_BUTTON);
ADD_FORM.addEventListener("submit", function (event) {
    event.preventDefault();
    addTask();
});

const SEARCH_INPUT = document.createElement("input");
SEARCH_INPUT.type = "search";
SEARCH_INPUT.placeholder = "search";
SEARCH_INPUT.addEventListener("input", function () {
    viewState.query = SEARCH_INPUT.value;
    onViewChange();
});

function createSelect(options, onChange) {
    const select = document.createElement("select");
    for (const [value, label] of options) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        select.append(option);
    }
    select.addEventListener("change", () => onChange(select.value));
    return select;
}

const FILTER_SELECT = createSelect(
    [["all", "all"], ["done", "done"], ["notDone", "not done"]],
    value => { viewState.filter = value; onViewChange(); }
);
const SORT_SELECT = createSelect(
    [["manual", "manual order"], ["newest", "newest first"], ["oldest", "oldest first"]],
    value => { viewState.sort = value; onViewChange(); }
);

const CONTROLS = document.createElement("section");
CONTROLS.className = "controls";
CONTROLS.append(SEARCH_INPUT, FILTER_SELECT, SORT_SELECT);

const RECORD_LIST_ELEMENT = document.createElement("ul");
RECORD_LIST_ELEMENT.className = "record-list";

APP.append(TITLE, ADD_FORM, CONTROLS, RECORD_LIST_ELEMENT);
document.body.append(APP);

function createButton(label, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", onClick);
    return button;
}

function createRecordElement(record, isEditing, canDrag) {
    const li = document.createElement("li");
    li.className = "item " + (record.isDone() ? "done" : "notDone");
    li.dataset.id = record.id;
    li.draggable = canDrag;

    if (isEditing) {
        const textInput = document.createElement("input");
        textInput.type = "text";
        textInput.className = "edit-text";
        textInput.value = record.text;

        const dateInput = document.createElement("input");
        dateInput.type = "date";
        dateInput.value = record.date;

        const save = () => saveEdit(record.id, textInput.value, dateInput.value);
        for (const input of [textInput, dateInput]) {
            input.addEventListener("keydown", function (event) {
                if (event.key === "Enter") save();
                if (event.key === "Escape") cancelEdit();
            });
        }
        li.append(textInput, dateInput, createButton("save", save), createButton("cancel", cancelEdit));
    } else {
        const text = document.createElement("span");
        text.className = "text";
        text.textContent = record.text;

        const time = document.createElement("time");
        time.dateTime = record.date;
        time.textContent = new Date(record.date).toLocaleDateString();

        li.append(
            text, time,
            createButton(record.isDone() ? "mark not done" : "mark done", () => toggleTask(record.id)),
            createButton("edit", () => editTask(record.id)),
            createButton("remove", () => removeTask(record.id))
        );
    }
    return li;
}

function drawRecordList() {
    const visible = recordList.getVisible(viewState);
    const canDrag = viewState.sort === "manual" && editingId === null;

    if (visible.length === 0) {
        const empty = document.createElement("li");
        empty.className = "empty";
        empty.textContent = "nothing found";
        RECORD_LIST_ELEMENT.replaceChildren(empty);
        return;
    }

    RECORD_LIST_ELEMENT.replaceChildren(
        ...visible.map(r => createRecordElement(r, r.id === editingId, canDrag))
    );

    const editInput = RECORD_LIST_ELEMENT.querySelector(".edit-text");
    if (editInput !== null) editInput.focus();
}

function update() {
    drawRecordList();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(recordList));
}

function onViewChange() {
    editingId = null;
    drawRecordList();
}

function addTask() {
    const text = TASK_TEXT_INPUT.value.trim();
    if (text === "") return;

    recordList.add(new Record(text, nextId++, TASK_DATE_INPUT.value || todayIso()));
    TASK_TEXT_INPUT.value = "";
    update();
}

function removeTask(id) {
    recordList.remove(id);
    update();
}

function toggleTask(id) {
    recordList.toggle(id);
    update();
}

function editTask(id) {
    editingId = id;
    drawRecordList();
}

function saveEdit(id, text, date) {
    text = text.trim();
    if (text !== "") recordList.edit(id, text, date);
    editingId = null;
    update();
}

function cancelEdit() {
    editingId = null;
    drawRecordList();
}

RECORD_LIST_ELEMENT.addEventListener("dragstart", function (event) {
    const item = event.target.closest(".item");
    if (item === null) return;
    dragId = Number(item.dataset.id);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(dragId));
    item.classList.add("dragging");
});

RECORD_LIST_ELEMENT.addEventListener("dragover", function (event) {
    if (dragId !== null) event.preventDefault();
});

RECORD_LIST_ELEMENT.addEventListener("drop", function (event) {
    event.preventDefault();
    const item = event.target.closest(".item");
    if (item === null || dragId === null) return;

    recordList.moveBefore(dragId, Number(item.dataset.id));
    dragId = null;
    update();
});

RECORD_LIST_ELEMENT.addEventListener("dragend", function () {
    dragId = null;
    drawRecordList();
});

drawRecordList();