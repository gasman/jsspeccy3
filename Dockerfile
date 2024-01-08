FROM node:20 as build

WORKDIR /usr/src/app

COPY package*.json ./
COPY webpack.config.js ./
COPY asconfig*.json ./
COPY README.md ./
COPY COPYING ./
COPY CHANGELOG.md ./

RUN npm install --verbose

# ENTRYPOINT ["tail"]
# CMD ["-f","/dev/null"]

# COPY . .
# RUN npm run build

# ENV NODE_OPTIONS = --openssl-legacy-provider
# RUN npm run build:core
# RUN npm run build:wasm:debug
# RUN npm run build:js
# RUN npm run build:static
# RUN npm run build
