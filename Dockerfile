FROM icr.io/codeengine/node:16-alpine
RUN npm install
COPY index.js .
COPY /audio /audio
COPY /uploads /uploads
EXPOSE 8080
CMD [ "node", "index.js" ]
