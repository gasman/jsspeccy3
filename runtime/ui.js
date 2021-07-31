export class MenuBar {
    constructor(container) {
        this.elem = document.createElement('div');
        this.elem.style.display = 'flow-root';
        this.elem.style.backgroundColor = '#eee';
        this.elem.style.fontFamily = 'Arial, Helvetica, sans-serif';
        this.elem.style.top = '0';
        this.elem.style.width = '100%';
        container.appendChild(this.elem);
    }

    addMenu(title) {
        return new Menu(this.elem, title);
    }

    enterFullscreen() {
        this.elem.style.position = 'absolute';
    }
    exitFullscreen() {
        this.elem.style.position = 'static';
    }
}

export class Menu {
    constructor(container, title) {
        const elem = document.createElement('div');
        elem.style.float = 'left';
        elem.style.position = 'relative';
        container.appendChild(elem);

        const button = document.createElement('button');
        button.style.margin = '2px';
        button.innerText = title;
        elem.appendChild(button);

        this.list = document.createElement('ul');
        this.list.style.position = 'absolute';
        this.list.style.width = '150px';
        this.list.style.backgroundColor = '#eee';
        this.list.style.listStyleType = 'none';
        this.list.style.margin = '0';
        this.list.style.padding = '0';
        this.list.style.border = '1px solid #888';
        this.list.style.display = 'none';
        elem.appendChild(this.list);

        button.addEventListener('click', () => {
            if (this.isOpen()) {
                this.close();
            } else {
                this.open();
            }
        })
        document.addEventListener('click', (e) => {
            if (e.target != button && this.isOpen()) this.close();
        })
    }

    isOpen() {
        return this.list.style.display == 'block';
    }

    open() {
        this.list.style.display = 'block';
    }

    close() {
        this.list.style.display = 'none';
    }

    addItem(title, onClick) {
        const li = document.createElement('li');
        this.list.appendChild(li);
        const button = document.createElement('button');
        button.innerText = title;
        button.style.width = '100%';
        button.style.textAlign = 'left';
        button.style.borderWidth = '0';
        button.style.paddingTop = '4px';
        button.style.paddingBottom = '4px';

        // eww.
        button.addEventListener('mouseover', () => {
            button.style.backgroundColor = '#ddd';
        });
        button.addEventListener('mouseout', () => {
            button.style.backgroundColor = 'inherit';
        });
        if (onClick) {
            button.addEventListener('click', onClick);
        }
        li.appendChild(button);
        return {
            setCheckbox: () => {
                button.innerText = String.fromCharCode(0x2022) + ' ' + title;
            },
            unsetCheckbox: () => {
                button.innerText = title;
            }
        }
    }
}

export class Toolbar {
    constructor(container) {
        this.elem = document.createElement('div');
        this.elem.style.backgroundColor = '#ccc';
        this.elem.style.bottom = '0';
        this.elem.style.width = '100%';
        container.appendChild(this.elem);
    }
    addButton(icon, label, onClick) {
        const button = document.createElement('button');
        button.style.margin = '2px';
        button.innerHTML = icon;
        button.firstChild.style.height = '20px';
        button.title = label;
        this.elem.appendChild(button);
        button.addEventListener('click', onClick);
    }
    enterFullscreen() {
        this.elem.style.position = 'absolute';
    }
    exitFullscreen() {
        this.elem.style.position = 'static';
    }
}
