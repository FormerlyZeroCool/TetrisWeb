import {SingleTouchListener, TouchMoveEvent, time_since_start_touch, isTouchSupported} from './io.js'
import {RGB, getWidth, getHeight} from './gui.js'
import {} from './game_utils'
import {FixedSizeQueue, Queue, sleep} from './utils.js'
interface Point {
    x:number;
    y:number;
}
interface Tetramino {
        type:string;
        center:number[];
        vectors:number[][];
        color:string;
        swapped:boolean;
};
class Field {
    field:RGB[];
    repaint:boolean;
    default_color:RGB;
    placementTimer:number;
    livePiece:Tetramino;
    pieceQueue:Queue<Tetramino>;
    pieceTypes:Tetramino[];
    possiblePieceTypes:Tetramino[];
    holdPiece:Tetramino;
    piecePosAtTouchStart:number[];
    canvas:HTMLCanvasElement;
    ctx:CanvasRenderingContext2D;
    boundedWidth:number;
    boundedHeight:number;
    xOffset:number;
    w:number;
    h:number;
    mousePos:Point;
    active:boolean;
    drawGrid:boolean;
    holdToggle:boolean;
    holdLimitToggle:boolean;
    showProjectedLanding:boolean;
    showPieceQueue:boolean;
    listenerHandler:SingleTouchListener;
    projectedLandingPiece:Tetramino;
    score:number;
    level:number;
    maxLevel:number;
    lastRowsCleared:number;
    constructor(canvas:HTMLCanvasElement, ctx:CanvasRenderingContext2D, maxLevel:number)
    {
        this.canvas = canvas;
        this.repaint = true;
        this.ctx = ctx;
        this.possiblePieceTypes = [];
        this.boundedWidth = canvas.width-canvas.width/10;
        this.boundedHeight = canvas.height;
        this.xOffset = (this.canvas.width - this.boundedWidth)/2;
        this.w = 10;
        this.h = 25;
        this.mousePos = {x:0, y:0};
        this.active = true;
        this.drawGrid = false;
        this.holdToggle = true;
        this.holdLimitToggle = true;
        this.showProjectedLanding = true;
        this.showPieceQueue = true;
        //this.projectedLandingPiece;
        this.score = 0;
        this.level = 0;
        this.maxLevel = maxLevel+1;
        this.lastRowsCleared = 0;
        this.pieceTypes = [
            //T
            {
                type:"t",
                center: [this.w/2,1],
                vectors:[[0,1],[-1,0],[0,0],[1,0]],
                color:"#A000B8",
                swapped:false
            },
            //O
            {
                type:"o",
                center: [this.w/2,1],
                vectors:[[0,0],[-1,-1],[0,-1],[-1,0]],
                color:"#D0D000",
                swapped:false
            },
            //Z
            {
                type:"z",
                center: [this.w/2,1],
                vectors:[[0,0],[-1,-1],[0,-1],[1,0]],
                color:"#AA0A00",
                swapped:false
            },
            //S
            {
                type:"s",
                center: [this.w/2,1],
                vectors:[[0,0],[-1,0],[0,-1],[1,-1]],
                color:"#00C000",
                swapped:false
            },
            //i
            {
                type:"i",
                center: [this.w/2,1],
                vectors:[[0,-1],[0,0],[0,1],[0,2]],
                color:"#00A0D0",
                swapped:false
            },
            //L
            {
                type:"l",
                center: [this.w/2,1],
                vectors:[[0,-1],[0,0],[0,1],[1,1]],
                color:"#F0B000",
                swapped:false
            },
            //j
            {
                type:"j",
                center: [this.w/2,1],
                vectors:[[0,-1],[0,0],[0,1],[-1,1]],
                color:"#0020D0",
                swapped:false
            }

        ];
        this.piecePosAtTouchStart = [0,0];
        this.listenerHandler = new SingleTouchListener(canvas, false, true, false);        
        this.listenerHandler.registerCallBack("touchmove", (event) => true, (event) => this.onMouseMove(event) );

        this.listenerHandler.registerCallBack("touchstart", e => true, e => {this.resetTouch();if(e.touchPos[0] < this.xOffset + this.boundedWidth && isTouchSupported())  e.preventDefault();});
        this.listenerHandler.registerCallBack("touchmove", e => this.touchmove_slideHPred(e), e => {this.hSlide(e);});
        this.listenerHandler.registerCallBack("touchmove", e => this.touchmove_slideVPred(e), e => {this.vSlide(e);});
        this.listenerHandler.registerCallBack("touchend", e => this.touchend_rotatePred(e), e => {this.rotate();});
        this.listenerHandler.registerCallBack("touchend", e => this.touchend_hardDropPred(e), e => {this.hardDrop();});
        this.listenerHandler.registerCallBack("touchend", e => this.touchend_holdLivePred(e), e => {this.holdLive();});
        this.listenerHandler.registerCallBack("touchend", e => this.touchend_holdLivePred2(e), e => {this.holdLive();});
        this.listenerHandler.registerCallBack("touchend", e => this.touchend_pausePred(e), e => {this.active = !this.active;});
    

        //this.canvas.addEventListener("click", (event) => this.onClickField(event) );

        this.holdPiece = {type:"null",center:[0,0],vectors:[], color:"#000000", swapped:true};
        this.field = [];
        this.livePiece = this.genRandomNewPiece();
        this.pieceQueue = new Queue();
        for(let i = 0; i < this.pieceQueue.data.length; i++)
        {
            this.pieceQueue.push(this.genRandomNewPiece());
        }
        this.default_color = new RGB(0, 0, 0, 255);
        for(let i = 0; i < this.w*this.h;i++)
        {
            this.field.push(new RGB(0, 0, 0, 255));
        }
        this.placementTimer = Date.now();
    }
    resize(width:number, height:number):void
    {
        this.canvas.width = width;
        this.canvas.height = height;
        this.boundedHeight = this.canvas.height;
        this.boundedWidth = this.boundedHeight/2.2;
        this.xOffset = (this.canvas.width-this.boundedWidth*1.4)/2;
        this.xOffset = this.xOffset<0?0:this.xOffset;
        this.draw();
    }  
    calcProjectedLanding():void
    {
        this.projectedLandingPiece = this.clonePiece(this.livePiece);
        while(this.isClearBelow(this.projectedLandingPiece) && this.projectedLandingPiece.center[1] < this.h)
        {
            this.projectedLandingPiece.center[1]++;
        }
    }  
    hSlide(event:TouchMoveEvent):void
    {
        const delta = (event.touchPos[0] - event.startTouchPos[0]) * 1.3;
        const newGridX = Math.round(((this.piecePosAtTouchStart[0] + delta > this.boundedWidth?this.boundedWidth:this.piecePosAtTouchStart[0] + delta)/this.boundedWidth)*this.w)
        let count = this.w;
        if(this.active)
        while(this.livePiece.center[0] != newGridX && count > 0)
        {
            count--;
            if(this.livePiece.center[0] < newGridX)
            {
                this.moveRight();
            }
            else
            {
                this.moveLeft();
            }
        }
    }
    vSlide(event:TouchMoveEvent):void
    {
        const delta = (event.touchPos[1] - event.startTouchPos[1]) * 1.3;
        const newGridY = Math.round(((this.piecePosAtTouchStart[1] + delta > this.boundedHeight?this.boundedHeight:this.piecePosAtTouchStart[1] + delta)/this.boundedHeight)*this.h);

        if(this.active)
        while(this.livePiece.center[1] <= newGridY && this.isClearBelow(this.livePiece))
        {
            this.livePiece.center[1]++;
        }
    }
    touchmove_slideHPred(event:TouchMoveEvent):boolean
    {
        return this.active //&& ( (Math.abs(event.angle) >= 165 || Math.abs(event.angle) <= 15));
    }
    touchmove_slideVPred(event:TouchMoveEvent):boolean
    {
        return this.active// && ( event.angle <= -65 && event.angle >= -115);
    }
    touchend_rotatePred(event:TouchMoveEvent):boolean
    {
        return this.active && event.mag < 7 && time_since_start_touch(event) < 250 && event.touchPos[0] < this.xOffset + this.boundedWidth;
    }
    touchend_pausePred(event:TouchMoveEvent):boolean
    {
        //tap registered
        return (event.mag < 14 && time_since_start_touch(event) < 250 && time_since_start_touch(event) > 50 && event.touchPos[0] > this.xOffset + this.boundedWidth && event.touchPos[1] >= this.boundedHeight/5);
    }
    touchend_hardDropPred(event:TouchMoveEvent):boolean
    {
        //swipe down identified  
        return (this.active && event.deltaY > 25 && event.avgVelocity > 30 && event.angle < 0 && Math.abs(event.angle) >= 45 && Math.abs(event.angle) <= 135 && time_since_start_touch(event) < 200);
    }
    touchend_holdLivePred2(event:TouchMoveEvent):boolean
    {
        //tap registered
        return (event.mag < 14 && time_since_start_touch(event) < 250 && time_since_start_touch(event) > 50 && event.touchPos[0] > this.xOffset + this.boundedWidth && event.touchPos[1] < this.boundedHeight/5);

    }
    touchend_holdLivePred(event:TouchMoveEvent):boolean
    {
        //swipe up identified
        return (this.active && event.deltaY < -40 && event.avgVelocity > 30 && event.angle >= 45 && event.angle <= 135 && time_since_start_touch(event) < 200);        
    }
    genRandomNewPiece():Tetramino
    {
        if(this.possiblePieceTypes.length == 0)
        {
            for(let i = 0; i < this.pieceTypes.length; i++)
            {
                this.possiblePieceTypes.push(this.clonePiece(this.pieceTypes[i]));
            }
        }
        const index = Math.floor(Math.random() * (this.possiblePieceTypes.length));
        const piece = this.clonePiece(this.possiblePieceTypes[index]);
        piece.swapped = false;
        this.possiblePieceTypes.splice(index, 1);
        return piece;
    }
    clonePiece(piece:Tetramino):Tetramino
    {
        const newPiece:Tetramino = {type:piece.type,center:[piece.center[0], piece.center[1]], vectors:[], color:piece.color, swapped: piece.swapped};
        for(let i = 0; i < piece.vectors.length; i++)
            newPiece.vectors.push([piece.vectors[i][0],piece.vectors[i][1]]);
 
        return newPiece;
    }
    rotateLeft(piece:Tetramino):void {
        for(let i = 0; i < piece.vectors.length; i++)
        {
            const temp = piece.vectors[i][1];
            piece.vectors[i][1] = piece.vectors[i][0]*-1;
            piece.vectors[i][0] = temp;
        }
    }
    rotateRight(piece:Tetramino):void {
        for(let i = 0; i < piece.vectors.length; i++)
        {
            const temp = piece.vectors[i][1];
            piece.vectors[i][1] = piece.vectors[i][0];
            piece.vectors[i][0] = temp*-1;
        }
    }
    isClear(piece:Tetramino):boolean
    {
        for(let i = 0; i < piece.vectors.length; i++)
        {
            const point = [piece.vectors[i][0]+piece.center[0], piece.vectors[i][1]+piece.center[1]];
            if(this.field[point[0] + point[1]*this.w].compare_not(this.default_color))
            {
                return false;
            }
        }
        return true;
    }
    onMouseMove(event:TouchMoveEvent):void
    {
        if(!this.active)
        {
            this.mousePos.x = event.touchPos[0];
            this.mousePos.y = event.touchPos[1];
        }
    }
    moveRight():boolean
    {
        if(this.isClearTranslated(this.livePiece, [1,0]))
        {
            this.livePiece.center[0]++;
            return true
        }
        return false;
    }
    moveLeft():boolean
    {
        if(this.isClearTranslated(this.livePiece, [-1,0]))
        {
            this.livePiece.center[0]--;
            return true;
        }
        return false;
    }
    rotate():void
    {
        if(this.livePiece.type != "o")
        {
            const newPiece = this.clonePiece(this.livePiece);
            this.rotateRight(newPiece);
            let maxOb = 0;
            for(let i = 0; i < newPiece.vectors.length; i++)
            {
                const vec = newPiece.vectors[i];
                const posX = vec[0]+newPiece.center[0];
                const posY = vec[1]+newPiece.center[1];
                if(posX < 0 && Math.abs(maxOb) < Math.abs(posX))
                {
                    maxOb = posX;
                }
                else if(posX >= this.w && Math.abs(maxOb) < Math.abs(posX-this.w+1))
                {
                    maxOb = posX-this.w+1;
                }
            }
            if(maxOb)
            {
                newPiece.center[0] -= maxOb;
            }
            if(this.isClearTranslated(newPiece,[0,0])){
                this.livePiece = newPiece;
            }
        }
    }
    holdLive():void
    {
        if((!this.livePiece.swapped || !this.holdLimitToggle) && this.holdToggle)
        {
            const type = this.livePiece.type;
            let old = this.pieceTypes.find(el => el.type === type)!;
            old.center = [this.w/2, 1];
            this.holdPiece.center = [this.w/2, 1];
            if(this.holdPiece && this.holdPiece.type !== "null")
            {
                this.livePiece = this.holdPiece;
                this.holdPiece = old;
            }
            else
            {
                this.livePiece = this.pieceQueue.pop();
                this.pieceQueue.push(this.genRandomNewPiece());
                this.holdPiece = old;
            }
            this.livePiece.swapped = true;
            this.listenerHandler.registeredTouch = false;
        }
    }
    hardDrop():void
    {
        this.clear(this.livePiece);
        while(this.isClearBelow(this.livePiece))
            this.livePiece.center[1]++;
        this.place(this.livePiece);
        this.livePiece = this.pieceQueue.pop();
        this.pieceQueue.push(this.genRandomNewPiece());
        this.livePiece.center = [this.w/2, 1];
        this.listenerHandler.registeredTouch = false;
        this.repaint = true;
    }
    moveDown():void
    {
        if(this.isClearTranslated(this.livePiece, [0,1]))
            this.livePiece.center[1]++;
    }
    onKeyPress(event:any):void
    {
        if(this.active)
        {
            this.repaint = true;
            if(event.code === "Space")//Hard drop
            {
                this.hardDrop();
            }
            else if((event.code === "KeyW" || event.keyCode === 38))//rotate
            {
                this.rotate();
            }
            else if(event.code === "KeyA" || event.keyCode === 37)//move/translate left
            {
                this.moveLeft();
            }
            else if(event.code === "KeyD" || event.keyCode === 39)//move/translate right
            {
                this.moveRight();
            }
            else if(event.code === "KeyS" || event.keyCode === 40)//move/translate down
            {
                this.moveDown();
            }
            else if(event.code == "KeyR" || event.code == "KeyC")//Hold piece implementation
            {
                this.holdLive();
            }
        }
        if(event.code === "KeyP")//pause/unpause
        {
            this.active = !this.active;
        }
    }
    clear(piece:Tetramino):void
    {
        for(let i = 0; i < piece.vectors.length; i++)
        {
            const point = [piece.vectors[i][0]+piece.center[0], piece.vectors[i][1]+piece.center[1]];
            this.field[point[0] + point[1] * this.w].copy(this.default_color);
        }
    }
    isClearTranslated(piece:Tetramino, vector:number[]):boolean
    {
        const center = [piece.center[0]+vector[0], piece.center[1]+vector[1]];
        for(let i = 0; i < piece.vectors.length; i++)
        {
            const point = [piece.vectors[i][0]+center[0], piece.vectors[i][1]+center[1]];
            if(point[1] >= this.h || point[0] < 0 || point[0] >= this.w)
                return false;
            else if(this.field[point[0] + point[1]*this.w].compare_not(this.default_color))
                return false;
        }
        return true;
    }
    isClearBelow(piece:Tetramino):boolean
    {
        return this.isClearTranslated(piece, [0,1]);
    }
    gameOver():void
    {
        //reset level, and score
        this.level = 0;
        this.score = 0;
        //set hold piece to empty for new game
        this.holdPiece = {type:"null", center:[0,0],vectors:[], color:"#000000", swapped:false};
        //reset piece queue
        const len = this.pieceQueue.length;
        this.pieceQueue.clear();
        for(let i = 0; i < len; i++)
            this.pieceQueue.push(this.genRandomNewPiece());
        //reset field for drawing
        for(let i = 0; i < this.field.length; i++)
            this.field[i].copy(this.default_color);
        
        this.repaint = true;
    }
    getFilledRows():number[]
    {
        const arr:number[] = [];
        for(let y = 0; y < this.h; y++)
        {
            let full = true;
            for(let x = 0; full && x < this.w; x++)
            {
                full = this.field[x + y*this.w].compare_not(this.default_color);
            }
            if(full)
                arr.push(y);
        }
        return arr;
    }
    placeField(data:Tetramino):void
    {
        data.vectors.forEach(el => {
            //calc x and y for point represented as point and vector
            const x = data.center[0]+el[0];
            const y = data.center[1]+el[1];
            //update color according to saved color 
            this.field[x + y*this.w].color = el[2];
        });
    }
    clearFilled():number
    {
        //get list of the indexes of rows to be cleared
        const filled = this.getFilledRows();
        //clear rows by shifting all elements less than each filled row starting at the topmost
        //iterating to the bottom most
        for(let i = 0; i < filled.length; i++)
        {
            this.clearRow(filled[i] + 1);
        }
        this.repaint = true;
        //return count of rows removed
        return filled.length;
    }
    clearRow(index:number):void
    {
        const shift_limit = index * this.w - 1;
        for(let i = shift_limit; i >= this.w; i--)
        {
            this.field[i].copy(this.field[i - this.w]);
        }
        for(let i = 0; i < this.w; i++)
        {
            this.field[i].copy(this.default_color);
        }
    }
    //places a piece on any field for drawing
    placeAny(piece:Tetramino, field:RGB[], w:number):void
    {
        this.repaint = true;
        const color = new RGB(0,0,0);
        color.loadString(piece.color);
        for(let i = 0; i < piece.vectors.length; i++)
        {
            const point = [piece.vectors[i][0] + piece.center[0], piece.vectors[i][1] + piece.center[1]];
            if(point[0] + point[1] * w < field.length)
            {
                field[point[0] + point[1] * w].copy(color);
            }
        }
    }
    //places a piece on the member variable field for drawing
    place(piece:Tetramino):void
    {
        this.placeAny(piece, this.field, this.w);
    }
    calcMaxScore(level:number):number
    {
        return 40 * (level+1) + 100 * (level) + 300 * level * +(level>2) + 1200 * level * +(level > 5);
    }
    update():void
    {
        if(!this.active)
            return;
        this.repaint = true;
        //check if any rows have been cleared
        //if they are clear them, and translate rows above down
        //returns count of rows cleared
        const rowsCleared = this.clearFilled();
        //scoring sytsem
        if(rowsCleared >= 4)
        {
            this.score += 800 + 400 * +(this.lastRowsCleared >= 4);
        }
        else
        {
            this.score += 100*rowsCleared;
        }
        //update last row cleared count for scoring
        if(rowsCleared > 0)
            this.lastRowsCleared = rowsCleared;
        //leveling system
        while(this.calcMaxScore(this.level) < this.score)
        {
            this.level++;
        }
        //check if piece can be moved down one
        if(this.isClearBelow(this.livePiece))
        {
            //move piece down one 
            this.livePiece.center[1] += 1;
            this.placementTimer = Date.now();
        }
        else if (Date.now() - this.placementTimer > 1000)
        //otherwise wait x ms, then place the current piece back on the field then draw new piece from queue
        {
            //place current piece onto screen
            this.place(this.livePiece);
            //get next live piece
            this.livePiece = this.pieceQueue.pop();
            this.resetTouch();
            if(this.listenerHandler.registeredTouch)
            {
                this.listenerHandler.registeredTouch = false;
            }
            //ensure it is in the correct position
            this.livePiece.center = [this.w/2, 1];
            //add new piece to queue of next pieces
            this.pieceQueue.push(this.genRandomNewPiece());

            //check if top row is full
            const topRow:Tetramino = {type:"none", center:[0,0],vectors:[], color:"#000000", swapped:false};
            //building vectors to point to top row
            for(let i = 0; i < this.w; i++)
            {
                topRow.vectors.push([i,0]);
            }
            
            //use existing algorithm to check if the top row is filled
            if(!this.isClear(topRow))
            {
                //reset game
                this.gameOver();
            }
        }
    }
    fillSpace(color:string, gx:number, gy:number, fill:boolean = true, width:number = this.boundedWidth/this.w, height:number = this.boundedHeight/this.h):void
    {
        if(fill)
        {
            this.ctx.fillStyle = color;
            this.ctx.fillRect(gx, gy, width, height);
            this.ctx.strokeStyle = "#FFFFFF";
        }
        
        this.ctx.strokeRect(gx+width/4, gy+height/4, width/2, height/2);
        this.ctx.strokeStyle = !fill ? "#FFFFFF" : "#000000";
        this.ctx.strokeRect(gx, gy, width, height);
    }
    draw():void
    {
        if(!this.repaint)
            return;

        let width = this.boundedWidth/this.w;
        let height = this.boundedHeight/this.h;
        this.repaint = false;
        this.ctx.clearRect(this.xOffset, 0, Math.min(this.canvas.width - this.xOffset, this.boundedWidth + this.boundedWidth / 2), this.boundedHeight);
        this.ctx.fillStyle = "#FF0000";
        
        this.ctx.fillStyle = "#000000";
        this.ctx.fillRect(this.xOffset, 0, this.boundedWidth, this.boundedHeight);
        if(this.showProjectedLanding)
        {
            this.calcProjectedLanding();
            for(let i = 0; i < this.projectedLandingPiece.vectors.length; i++)
            {
                const vector = this.projectedLandingPiece.vectors[i];
                const gx = this.xOffset + Math.floor((this.projectedLandingPiece.center[0] + vector[0])*this.boundedWidth/this.w);
                const gy = Math.floor((this.projectedLandingPiece.center[1] + vector[1])*this.boundedHeight/this.h);
                this.ctx.strokeStyle = this.livePiece.color;
                this.fillSpace("#000000", gx, gy, false);
            }
        }
        for(let i = 0; i < this.livePiece.vectors.length; i++)
        {
            const vector = this.livePiece.vectors[i];
            const gx = this.xOffset + Math.floor((this.livePiece.center[0] + vector[0]) * this.boundedWidth / this.w);
            const gy = Math.floor((this.livePiece.center[1] + vector[1]) * this.boundedHeight / this.h);
            
            this.fillSpace(this.livePiece.color, gx, gy);
        }
        for(let y = 0; y < this.h; y++)
        {
            for(let x = 0; x < this.w; x++)
            {   
                if(this.field[x + y*this.w].compare_not(this.default_color))
                {
                    this.fillSpace(this.field[x + y*this.w].htmlRBG(), this.xOffset + x * width, y * height);
                }
                this.ctx.strokeStyle = "#FFFFFF";
                if(this.drawGrid)
                    this.ctx.strokeRect(this.xOffset + x * width, y * height, width, height);

            }
        }
        width -= width/3;
        height -= height/3;
        const hoffset = 30+8*height;
        this.ctx.font = `${height}px Calibri`;
        this.ctx.fillStyle = "#000000";
        this.ctx.fillText('Hold Piece:', this.xOffset + 5+this.boundedWidth, height);
        this.ctx.fillText('Score: '+this.score, this.xOffset + 5+this.boundedWidth, 17+height*6.8);
        const levelText = this.level === (this.maxLevel-1)?"Max":this.level;
        this.ctx.fillText('Level: '+levelText, this.xOffset + 5+this.boundedWidth, 17+height*7.5+20);
        if(this.showPieceQueue)
        {
            for(let i = 0; i < this.pieceQueue.length && i < 5; i++)
            {
                let field:RGB[] = [];
                for(let j = 0; j < 25; j++)
                    field.push(new RGB(0,0,0,0).copy(this.default_color));
                const piece:Tetramino = {type:this.pieceQueue.get(i).type,center:[2,2], vectors:this.pieceQueue.get(i).vectors, color:this.pieceQueue.get(i).color, swapped:this.pieceQueue.get(i).swapped};
                
                this.placeAny(piece, field, 5);
                this.ctx.fillStyle = "#000000";
                this.ctx.fillRect(this.xOffset + this.boundedWidth+5, hoffset+(height*5.2)*i, width*5, height*5);
                for(let y = 0; y < 5; y++)
                {
                    for(let x = 0; x < 5; x++)
                    {
                        const color = field[x + y*5].color;
                        const gx = this.xOffset + this.boundedWidth+5+(width)*x;
                        const gy = hoffset+(height*5.2)*i+(height)*y;
                        if(color !== this.default_color.color){
                            //this.ctx.fillStyle = field[x + y*5].htmlRBG();
                            //this.ctx.fillRect(gx, gy, width, height);
                            this.fillSpace(field[x + y*5].htmlRBG(), gx, gy, true, width, height);
                        }
                    }
                }
    
            }
        }

        if(this.holdToggle)
        {
            let field:RGB[] = [];
            for(let j = 0; j < 25; j++)
                field.push(new RGB(0,0,0,0).copy(this.default_color));
            const piece:Tetramino = {type:this.holdPiece.type,center:[2,1], vectors:this.holdPiece.vectors, color:this.holdPiece.color, swapped:this.holdPiece.swapped};
            
            this.placeAny(piece, field, 5);
            this.ctx.fillStyle = "#000000";
            this.ctx.fillRect(this.xOffset + this.boundedWidth+5, height+5, width*5, height*5);
            for(let y = 0; y < 5; y++)
            {
                for(let x = 0; x < 5; x++)
                {
                    const color = field[x + y*5].color;
                    const gx = this.xOffset + this.boundedWidth+5+(width)*x;
                    const gy = 30+(height)*y+5;
                    if(color !== this.default_color.color){
                        //this.ctx.fillStyle = field[x + y*5].htmlRBG();
                        //this.ctx.fillRect(gx, gy, width, height);
                        this.fillSpace(field[x + y*5].htmlRBG(), gx, gy, true, width, height);
                    }
                }
            }
        }
            
        if(!this.active)
        {
            this.ctx.font = '48px Calibri';
            this.ctx.fillStyle = "#DF0000";
            this.ctx.strokeStyle = "#FFFFFF";
            this.ctx.fillText('Game Paused', this.xOffset + this.boundedWidth/2 - this.boundedWidth/4, this.boundedHeight/2);
            this.ctx.strokeText('Game Paused', this.xOffset + this.boundedWidth/2 - this.boundedWidth/4, this.boundedHeight/2);
        }
        
    }
    resetTouch()
    {
        this.piecePosAtTouchStart = [this.livePiece.center[0]*this.boundedWidth/this.w,this.livePiece.center[1]*this.boundedHeight/this.h];
    }

    wait_per_update():number
    {
        return (this.maxLevel - this.level) * 15;
    }
};
function toggleBackgroundColorButton(button:HTMLElement, selected:boolean):void
{
    if(selected)
        button.style.background = "#8080D0";
    else
        button.style.background = "#808080";
}

function main():void
{
    const canvas:HTMLCanvasElement = <HTMLCanvasElement> document.getElementById("screen")!;

    const ctx = canvas.getContext("2d")!;
    const gridDim = 4
    
    ctx.fillStyle = "#FF0000";
    let x = 0
    const dim = canvas.width;
    let field = new Field(canvas, ctx, 25);
    window.game = field;
    const snHeight = document.getElementById("site_name")!.clientHeight
    field.resize(getWidth(), getHeight());

    const gridToggleButton = document.getElementById("gridToggleButton")!;
    gridToggleButton.addEventListener("click", event => {field.drawGrid = !field.drawGrid; toggleBackgroundColorButton(gridToggleButton, field.drawGrid);});
    toggleBackgroundColorButton(gridToggleButton, field.drawGrid);
    
    const holdToggleButton = document.getElementById("holdToggleButton")!;
    holdToggleButton.addEventListener("click", event => {field.holdToggle = !field.holdToggle; 
        toggleBackgroundColorButton(holdToggleButton, field.holdToggle);});
    toggleBackgroundColorButton(holdToggleButton, field.holdToggle);

    const holdLimitToggle = document.getElementById("holdLimitButton")!;
    holdLimitToggle.addEventListener("click", event => {field.holdLimitToggle = !field.holdLimitToggle; 
        toggleBackgroundColorButton(holdLimitToggle, field.holdLimitToggle);});
    toggleBackgroundColorButton(holdLimitToggle, field.holdLimitToggle);

    const projectedLandingToggle = document.getElementById("projectedLandingToggleButton")!;
    projectedLandingToggle.addEventListener("click", event => {field.showProjectedLanding = !field.showProjectedLanding; 
        toggleBackgroundColorButton(projectedLandingToggle, field.showProjectedLanding);});
    toggleBackgroundColorButton(projectedLandingToggle, field.showProjectedLanding);

    const pieceQueueShowingToggleButton = document.getElementById("pieceQueueShowingToggleButton")!;
    pieceQueueShowingToggleButton.addEventListener("click", event => {field.showPieceQueue = !field.showPieceQueue; 
        toggleBackgroundColorButton(pieceQueueShowingToggleButton, field.showPieceQueue);});
    toggleBackgroundColorButton(pieceQueueShowingToggleButton, field.showPieceQueue);

    window.addEventListener('keydown', function(e) {
        if((e.keyCode == 32 || e.keyCode == 37 || e.keyCode == 38 || e.keyCode == 39 || e.keyCode == 40) && e.target == document.body) {
          e.preventDefault();
          field.onKeyPress(e)
        }
        else
        {
            field.onKeyPress(e);
        }
      });
    let count = 0;
    let last_update = Date.now();
    let width = getWidth();
    let height = getHeight() - 3 * snHeight;
    let draw = () => {
        if(width !== getWidth() || height !== getHeight())
        {
            console.log(getHeight(), height, getWidth(), width);
            field.resize(getWidth(), getHeight() - 3 * snHeight);
            width = getWidth();
            height = getHeight();
        }
        count++;
        if(field.wait_per_update() < Date.now() - last_update)
        {
            const updates = Math.floor((Date.now() - last_update) / field.wait_per_update());
            for(let i = 0; i < updates && i < 5; i++)
            {
                field.update();
                last_update = Date.now();
            }

        }
        field.draw();
        requestAnimationFrame(draw);
    }
    draw();
}
main();